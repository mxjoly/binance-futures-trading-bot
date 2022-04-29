import {
  CandleChartInterval,
  ExchangeInfo,
  OrderSide,
  OrderType,
} from 'binance-api-node';
import { decimalFloor } from './utils/math';
import { log, error, logBuySellExecutionOrder } from './utils/log';
import { binanceClient, BINANCE_MODE } from './init';
import {
  loadCandlesFromAPI,
  loadCandlesMultiTimeFramesFromAPI,
} from './utils/loadCandleData';
import { Counter } from './tools/counter';
import { calculateActivationPrice } from './utils/trailingStop';
import { isOnTradingSession } from './utils/tradingSession';
import {
  getPricePrecision,
  getQuantityPrecision,
  isValidQuantity,
} from './utils/currencyInfo';
import { Pivots, Zigzag } from './indicators';

// ====================================================================== //

/**
 * Production bot
 */
export class Bot {
  private strategyConfigs: StrategyConfig[];

  // Counter to fix the max duration of each trade
  private counters: { [symbol: string]: Counter };

  constructor(tradeConfigs: StrategyConfig[]) {
    this.strategyConfigs = tradeConfigs;
    this.counters = {};
  }

  /**
   * Prepare the account
   */
  public async prepare() {
    if (BINANCE_MODE === 'futures') {
      // Set the margin type and initial leverage for the futures
      this.strategyConfigs.forEach((tradeConfig) => {
        const pair = tradeConfig.asset + tradeConfig.base;

        binanceClient
          .futuresLeverage({
            symbol: pair,
            leverage: tradeConfig.leverage || 1,
          })
          .then(() =>
            log(`Leverage for ${pair} is set to ${tradeConfig.leverage || 1}`)
          )
          .catch(error);

        binanceClient
          .futuresMarginType({
            symbol: pair,
            marginType: 'ISOLATED',
          })
          .catch(error);
      });
    }

    // Initialize the counters
    this.strategyConfigs.forEach(({ asset, base, maxTradeDuration }) => {
      if (maxTradeDuration)
        this.counters[asset + base] = new Counter(maxTradeDuration);
    });
  }

  /**
   * Main function
   */
  public async run() {
    log(
      '====================== 💵 BINANCE BOT TRADING 💵 ======================'
    );

    // Get the exchange info
    const exchangeInfo =
      BINANCE_MODE === 'spot'
        ? await binanceClient.exchangeInfo()
        : await binanceClient.futuresExchangeInfo();

    // Socket
    const getCandles =
      BINANCE_MODE === 'spot'
        ? binanceClient.ws.candles
        : binanceClient.ws.futuresCandles;

    this.strategyConfigs.forEach((tradeConfig) => {
      const pair = tradeConfig.asset + tradeConfig.base;
      log(`The bot trades the pair ${pair}`);

      getCandles(pair, tradeConfig.loopInterval, (candle) => {
        if (candle.isFinal) {
          // Load the candle data for each the time frames that will be use on the strategy
          loadCandlesMultiTimeFramesFromAPI(tradeConfig, binanceClient).then(
            (candlesMultiTimeFrames) => {
              if (BINANCE_MODE === 'spot') {
                this.tradeWithSpot(
                  tradeConfig,
                  Number(candle.close),
                  candlesMultiTimeFrames,
                  exchangeInfo
                );
              } else {
                this.tradeWithFutures(
                  tradeConfig,
                  Number(candle.close),
                  candlesMultiTimeFrames,
                  exchangeInfo
                );
              }
            }
          );
        }
      });
    });
  }

  /**
   * Main spot function (buy/sell, open/close orders)
   * @param strategyConfig
   * @param currentPrice
   * @param candles
   * @param exchangeInfo
   */
  private async tradeWithSpot(
    strategyConfig: StrategyConfig,
    currentPrice: number,
    candles: CandlesDataMultiTimeFrames,
    exchangeInfo: ExchangeInfo
  ) {
    const {
      asset,
      base,
      risk,
      buyStrategy,
      sellStrategy,
      exitStrategy,
      riskManagement,
      tradingSessions,
      allowPyramiding,
      maxPyramidingAllocation,
      loopInterval,
      maxTradeDuration,
    } = strategyConfig;
    const pair = asset + base;

    // Balance information
    const { balances } = await binanceClient.accountInfo();
    const assetBalance = Number(
      balances.find((balance) => balance.asset === asset).free
    );
    const baseBalance = Number(
      balances.find((balance) => balance.asset === base).free
    );

    // Open orders
    const currentOpenOrders = await binanceClient.openOrders({
      symbol: pair,
    });

    // Conditions
    const canBuy =
      !allowPyramiding ||
      (allowPyramiding &&
        assetBalance * currentPrice <= baseBalance * maxPyramidingAllocation);

    // Check if we are in the trading sessions
    const isTradingSessionActive = isOnTradingSession(
      candles[loopInterval][candles[loopInterval].length - 1].closeTime,
      tradingSessions
    );

    // Precisions
    const pricePrecision = getPricePrecision(pair, exchangeInfo);
    const quantityPrecision = getQuantityPrecision(pair, exchangeInfo);

    // The current trade is too long
    if (this.counters[pair] && maxTradeDuration && assetBalance > 0) {
      this.counters[pair].decrement();
      if (this.counters[pair].getValue() == 0) {
        binanceClient
          .order({
            symbol: pair,
            type: OrderType.MARKET,
            quantity: String(assetBalance),
            side: OrderSide.SELL,
          })
          .then(() => {
            this.counters[pair].reset();
            this.closeOpenOrders(pair);
            log(
              `The trade on ${pair} is longer that the maximum authorized duration. Trade has been closed.`
            );
          })
          .catch(error);
        return;
      }
    }

    // Prevent remaining open orders
    if (assetBalance === 0 && currentOpenOrders.length > 0) {
      this.closeOpenOrders(pair);
    }

    // Reset the counter if a previous trade close a the position
    if (
      this.counters[pair] &&
      maxTradeDuration &&
      assetBalance === 0 &&
      this.counters[pair].getValue() < maxTradeDuration
    ) {
      this.counters[pair].reset();
    }

    if (assetBalance > 0 && sellStrategy(candles)) {
      binanceClient
        .order({
          side: OrderSide.SELL,
          type: OrderType.MARKET,
          symbol: pair,
          quantity: String(assetBalance),
        })
        .then(() => {
          this.closeOpenOrders(pair);
          const totalValue = currentPrice * Number(assetBalance);
          log(
            `Sell ${assetBalance}${asset} at the price ${currentPrice} for ${totalValue}${base}.`
          );
        })
        .catch(error);
    } else if (isTradingSessionActive && canBuy && buyStrategy(candles)) {
      const quantity = riskManagement({
        asset,
        base,
        balance: baseBalance,
        risk,
        enterPrice: currentPrice,
        exchangeInfo,
      });

      // Buy market order
      binanceClient
        .order({
          side: OrderSide.BUY,
          type: OrderType.MARKET,
          symbol: pair,
          quantity: String(quantity),

          timeInForce: 'GTC',
        })
        .then(({ price: orderPrice }) => {
          // Calculate the tp and sl
          const { takeProfits, stopLoss } = exitStrategy
            ? exitStrategy(currentPrice, candles, pricePrecision, OrderSide.BUY)
            : { takeProfits: [], stopLoss: null };

          // Remove the current open orders to update them
          if (currentOpenOrders.length > 0) this.closeOpenOrders(pair);

          return { orderPrice, takeProfits, stopLoss };
        })
        .then(({ orderPrice, stopLoss, takeProfits }) => {
          if (takeProfits.length === 1 && stopLoss) {
            // Sell oco order as TP/SL
            binanceClient
              .orderOco({
                side: OrderSide.SELL,
                symbol: pair,
                price: String(takeProfits[0].price),
                stopPrice: String(stopLoss),
                stopLimitPrice: String(stopLoss),
                quantity: String(
                  decimalFloor(
                    quantity * takeProfits[0].quantityPercentage,
                    quantityPrecision
                  )
                ),
              })
              .catch(error);
          } else {
            if (takeProfits.length > 0) {
              // Create all the take profit targets
              takeProfits.forEach(({ price, quantityPercentage }) => {
                // Sell limit order as TP
                binanceClient
                  .order({
                    side: OrderSide.SELL,
                    type: OrderType.TAKE_PROFIT_LIMIT,
                    symbol: pair,
                    stopPrice: String(price),
                    price: String(price),
                    quantity: String(
                      decimalFloor(
                        quantity * quantityPercentage,
                        quantityPrecision
                      )
                    ),
                  })
                  .catch(error);
              });
            }

            if (stopLoss) {
              // Sell limit order as SL
              binanceClient
                .order({
                  side: OrderSide.SELL,
                  type: OrderType.STOP_LOSS_LIMIT,
                  symbol: pair,
                  stopPrice: String(stopLoss),
                  price: String(stopLoss),
                  quantity: String(quantity),
                })
                .catch(error);
            }
          }

          logBuySellExecutionOrder(
            OrderSide.BUY,
            asset,
            base,
            Number(orderPrice),
            quantity,
            takeProfits,
            stopLoss
          );
        })
        .catch(error);
    }
  }

  /**
   * Main futures function (long/short, open/close orders)
   * @param tradeConfig
   * @param currentPrice
   * @param candles
   * @param exchangeInfo
   */
  private async tradeWithFutures(
    strategyConfig: StrategyConfig,
    currentPrice: number,
    candles: CandlesDataMultiTimeFrames,
    exchangeInfo: ExchangeInfo
  ) {
    const {
      asset,
      base,
      risk,
      buyStrategy,
      sellStrategy,
      exitStrategy,
      trendFilter,
      riskManagement,
      tradingSessions,
      trailingStopConfig,
      allowPyramiding,
      maxPyramidingAllocation,
      unidirectional,
      loopInterval,
      maxTradeDuration,
    } = strategyConfig;
    const pair = asset + base;

    // Check the trend
    const useLongPosition = trendFilter ? trendFilter(candles) === 1 : true;
    const useShortPosition = trendFilter ? trendFilter(candles) === -1 : true;

    // Balance information
    const balances = await binanceClient.futuresAccountBalance();
    const { balance: assetBalance, availableBalance } = balances.find(
      (balance) => balance.asset === base
    );

    // Position information
    const { positions } = await binanceClient.futuresAccountInfo();
    const position = positions.find((position) => position.symbol === pair);
    const hasLongPosition = Number(position.positionAmt) > 0;
    const hasShortPosition = Number(position.positionAmt) < 0;
    const positionSize = Math.abs(Number(position.positionAmt));
    const positionEntryPrice = Number(position.entryPrice);

    // Conditions to take or not a position
    const canAddToPosition = allowPyramiding
      ? Number(position.initialMargin) + Number(assetBalance) * risk <=
        Number(assetBalance) * maxPyramidingAllocation
      : false;
    const canTakeLongPosition =
      (!allowPyramiding && !hasLongPosition) || allowPyramiding;
    const canTakeShortPosition =
      (!allowPyramiding && !hasShortPosition) || allowPyramiding;

    // Open Orders
    const currentOpenOrders = await binanceClient.futuresOpenOrders({
      symbol: pair,
    });

    // Precision
    const pricePrecision = getPricePrecision(pair, exchangeInfo);
    const quantityPrecision = getQuantityPrecision(pair, exchangeInfo);

    // Check if we are in the trading sessions
    const isTradingSessionActive = isOnTradingSession(
      candles[loopInterval][candles[loopInterval].length - 1].closeTime,
      tradingSessions
    );

    // The current position is too long
    if (
      maxTradeDuration &&
      (hasShortPosition || hasLongPosition) &&
      this.counters[pair]
    ) {
      this.counters[pair].decrement();
      if (this.counters[pair].getValue() == 0) {
        binanceClient
          .futuresOrder({
            symbol: pair,
            type: OrderType.MARKET,
            quantity: String(positionSize),
            side: hasLongPosition ? OrderSide.SELL : OrderSide.BUY,
          })
          .then(() => {
            this.counters[pair].reset();
            this.closeOpenOrders(pair);
            log(
              `The position on ${pair} is longer that the maximum authorized duration. Position has been closed.`
            );
          })
          .catch(error);
        return;
      }
    }

    // Prevent remaining open orders when all the take profit or a stop loss has been filled
    if (!hasLongPosition && !hasShortPosition && currentOpenOrders.length > 0) {
      this.closeOpenOrders(pair);
    }

    // Reset the counter if a previous trade close a the position
    if (
      maxTradeDuration &&
      !hasLongPosition &&
      !hasShortPosition &&
      this.counters[pair].getValue() < maxTradeDuration
    ) {
      this.counters[pair].reset();
    }

    if (
      (isTradingSessionActive || positionSize !== 0) &&
      canTakeLongPosition &&
      currentOpenOrders.length === 0 &&
      buyStrategy(candles)
    ) {
      // Take the profit and not open a new position
      if (hasShortPosition && unidirectional) {
        binanceClient
          .futuresOrder({
            side: OrderSide.BUY,
            type: OrderType.MARKET,
            symbol: pair,
            quantity: String(positionSize),
          })
          .then(() => {
            this.closeOpenOrders(pair);
            log(
              `Close the short position on ${pair}. PNL: ${position.unrealizedProfit}`
            );
          });
        return;
      }

      // Do not trade with long position if the trend is down
      if (!useLongPosition) return;

      // Do not add to the current position if the allocation is over the max allocation
      if (allowPyramiding && hasLongPosition && !canAddToPosition) return;

      // Do not close the current short position built progressively in pyramiding mode
      if (allowPyramiding && hasShortPosition) return;

      // Do not buy now if a take profit is already set on the last short position
      let hasTakeProfits = currentOpenOrders.some(
        (order) => order.price < position.entryPrice
      );
      if (hasShortPosition && hasTakeProfits) return;

      // Calculate TP and SL
      let { takeProfits, stopLoss } = exitStrategy
        ? exitStrategy(currentPrice, candles, pricePrecision, OrderSide.BUY)
        : { takeProfits: [], stopLoss: null };

      //Calculate the quantity for the position according to the risk management of the strategy
      let quantity = riskManagement({
        asset,
        base,
        balance: allowPyramiding
          ? Number(assetBalance)
          : Number(availableBalance),
        risk,
        enterPrice: currentPrice,
        stopLossPrice: stopLoss,
        exchangeInfo,
      });

      // Quantity to add to close the previous position
      let previousPositionQuantity = hasShortPosition ? positionSize : 0;

      // To close the previous short position
      if (
        isValidQuantity(quantity + previousPositionQuantity, pair, exchangeInfo)
      ) {
        quantity += previousPositionQuantity;
      } else {
        throw new Error(`Invalid quantity order for ${pair}: ${quantity}`);
      }

      binanceClient
        .futuresOrder({
          side: OrderSide.BUY,
          type: OrderType.MARKET,
          symbol: pair,
          quantity: String(quantity),
        })
        .then(() => {
          // Cancel the previous orders to update them
          if (currentOpenOrders.length > 0) {
            this.closeOpenOrders(pair);
          }

          // Calculate the total size and the average entry price on the position updated
          const positionTotalSize = positionSize + quantity;
          const avgPrice =
            (positionSize * positionEntryPrice + quantity * currentPrice) /
            (positionSize + quantity);

          // In pyramiding mode, update the take profits and stop loss
          if (allowPyramiding && hasLongPosition) {
            let { takeProfits: updatedTakeProfits, stopLoss: updatedStopLoss } =
              exitStrategy
                ? exitStrategy(avgPrice, candles, pricePrecision, OrderSide.BUY)
                : { takeProfits: [], stopLoss: null };
            takeProfits = updatedTakeProfits;
            stopLoss = updatedStopLoss;
          }

          if (takeProfits.length > 0) {
            // Create the take profit orders
            takeProfits.forEach(({ price, quantityPercentage }) => {
              binanceClient
                .futuresOrder({
                  side: OrderSide.SELL,
                  type: OrderType.LIMIT,
                  symbol: pair,
                  price: price,
                  quantity: String(
                    decimalFloor(
                      Number(positionTotalSize) * quantityPercentage,
                      quantityPrecision
                    )
                  ),
                })
                .catch(error);
            });
          }

          if (stopLoss) {
            // Stop loss order
            binanceClient
              .futuresOrder({
                side: OrderSide.SELL,
                type: OrderType.STOP,
                symbol: pair,
                stopPrice: stopLoss,
                price: stopLoss,
                quantity: String(positionTotalSize),
              })
              .catch(error);
          }

          if (trailingStopConfig) {
            let activationPrice = calculateActivationPrice(
              trailingStopConfig,
              avgPrice,
              pricePrecision,
              takeProfits
            );

            binanceClient
              .futuresOrder({
                side: OrderSide.SELL,
                type: OrderType.TRAILING_STOP_MARKET,
                symbol: pair,
                quantity: String(positionTotalSize),
                callbackRate: trailingStopConfig.callbackRate * 100,
                activationPrice,
              })
              .catch(error);
          }

          if (hasLongPosition) {
            log(
              `Add ${quantity}${asset} to the long position on ${pair}. The average entry price is now ${avgPrice}${base} and the total size ${positionTotalSize}${asset}`
            );
          } else {
            logBuySellExecutionOrder(
              OrderSide.BUY,
              asset,
              base,
              currentPrice,
              quantity,
              takeProfits,
              stopLoss
            );
          }
        })
        .catch(error);
    } else if (
      (isTradingSessionActive || positionSize !== 0) &&
      canTakeShortPosition &&
      currentOpenOrders.length === 0 &&
      sellStrategy(candles)
    ) {
      // Take the profit and not open a new position
      if (hasLongPosition && unidirectional) {
        binanceClient
          .futuresOrder({
            side: OrderSide.SELL,
            type: OrderType.MARKET,
            symbol: pair,
            quantity: String(positionSize),
          })
          .then(() => {
            this.closeOpenOrders(pair);
            log(
              `Close the long position on ${pair}. PNL: ${position.unrealizedProfit}`
            );
          });
        return;
      }

      // Do not trade with short position if the trend is up
      if (!useShortPosition) return;

      // Do not add to the current position if the allocation is over the max allocation
      if (allowPyramiding && hasShortPosition && !canAddToPosition) return;

      // Do not close the current short position built progressively in pyramiding mode
      if (allowPyramiding && hasLongPosition) return;

      // Do not sell now if a take profit is already set on the last long position
      let hasTakeProfits = currentOpenOrders.some(
        (order) => order.price > position.entryPrice
      );
      if (hasLongPosition && hasTakeProfits) return;

      // Calculate TP and SL
      let { takeProfits, stopLoss } = exitStrategy
        ? exitStrategy(currentPrice, candles, pricePrecision, OrderSide.SELL)
        : { takeProfits: [], stopLoss: null };

      // Calculate the quantity for the position according to the risk management of the strategy
      let quantity = riskManagement({
        asset,
        base,
        balance: allowPyramiding
          ? Number(assetBalance)
          : Number(availableBalance),
        risk,
        enterPrice: currentPrice,
        stopLossPrice: stopLoss,
        exchangeInfo,
      });

      // Quantity to add to close the previous position
      let previousPositionQuantity = hasLongPosition ? positionSize : 0;

      // To close the previous long position
      if (
        isValidQuantity(quantity + previousPositionQuantity, pair, exchangeInfo)
      ) {
        quantity += previousPositionQuantity;
      } else {
        throw new Error(`Invalid quantity order for ${pair}: ${quantity}`);
      }

      binanceClient
        .futuresOrder({
          side: OrderSide.SELL,
          type: OrderType.MARKET,
          symbol: pair,
          quantity: String(quantity),
        })
        .then(() => {
          // Cancel the previous orders to update them
          if (currentOpenOrders.length > 0) {
            this.closeOpenOrders(pair);
          }

          // Calculate the total size and the average entry price on the position updated
          const positionTotalSize = positionSize + quantity;
          const avgPrice =
            (positionSize * positionEntryPrice + quantity * currentPrice) /
            (positionSize + quantity);

          // In pyramiding mode, update the take profits and stop loss
          if (allowPyramiding && hasShortPosition) {
            let { takeProfits: updatedTakeProfits, stopLoss: updatedStopLoss } =
              exitStrategy
                ? exitStrategy(avgPrice, candles, pricePrecision, OrderSide.BUY)
                : { takeProfits: [], stopLoss: null };
            takeProfits = updatedTakeProfits;
            stopLoss = updatedStopLoss;
          }

          if (takeProfits.length > 0) {
            // Create the take profit orders
            takeProfits.forEach(({ price, quantityPercentage }) => {
              binanceClient
                .futuresOrder({
                  side: OrderSide.BUY,
                  type: OrderType.LIMIT,
                  symbol: pair,
                  price: price,
                  quantity: String(
                    decimalFloor(
                      Number(positionTotalSize) * quantityPercentage,
                      quantityPrecision
                    )
                  ),
                })
                .catch(error);
            });
          }

          if (stopLoss) {
            // Stop loss order
            binanceClient
              .futuresOrder({
                side: OrderSide.BUY,
                type: OrderType.STOP,
                symbol: pair,
                stopPrice: stopLoss,
                price: stopLoss,
                quantity: String(positionTotalSize),
              })
              .catch(error);
          }

          if (trailingStopConfig) {
            let activationPrice = calculateActivationPrice(
              trailingStopConfig,
              avgPrice,
              pricePrecision,
              takeProfits
            );

            binanceClient
              .futuresOrder({
                side: OrderSide.BUY,
                type: OrderType.TRAILING_STOP_MARKET,
                symbol: pair,
                quantity: String(positionTotalSize),
                callbackRate: trailingStopConfig.callbackRate * 100,
                activationPrice,
              })
              .catch(error);
          }

          if (hasShortPosition) {
            log(
              `Add ${quantity}${asset} to the short position on ${pair}. The average entry price is now ${avgPrice}${base} and the total size ${positionTotalSize}${asset}`
            );
          } else {
            logBuySellExecutionOrder(
              OrderSide.SELL,
              asset,
              base,
              currentPrice,
              quantity,
              takeProfits,
              stopLoss
            );
          }
        })
        .catch(error);
    }
  }

  /**
   *  Close all the open orders for a given symbol
   * @param pair
   */
  private closeOpenOrders(pair: string) {
    return new Promise<void>((resolve, reject) => {
      const cancel =
        BINANCE_MODE === 'spot'
          ? binanceClient.cancelOpenOrders
          : binanceClient.futuresCancelAllOpenOrders;

      cancel({ symbol: pair })
        .then(() => {
          log(`Close all open orders for the pair ${pair}`);
          resolve();
        })
        .catch(reject);
    });
  }
}
