import {
  Candle,
  CandleChartInterval,
  ExchangeInfo,
  OrderSide,
  OrderType,
} from 'binance-api-node';
import {
  getPricePrecision,
  getQuantityPrecision,
  isValidQuantity,
} from './utils/rules';
import { decimalCeil, decimalFloor } from './utils/math';
import { log, error, logBuySellExecutionOrder } from './utils/log';
import { binanceClient, BINANCE_MODE } from '.';

// ====================================================================== //

export class Bot {
  private tradeConfigs: TradeConfig[];

  constructor(tradeConfigs: TradeConfig[]) {
    this.tradeConfigs = tradeConfigs;
  }

  public async prepare() {
    if (BINANCE_MODE === 'futures') {
      // Set the margin type and initial leverage for the futures
      this.tradeConfigs.forEach((tradeConfig) => {
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
  }

  public async run() {
    log(
      '====================== 💵 BINANCE BOT TRADING 💵 ======================'
    );

    const exchangeInfo =
      BINANCE_MODE === 'spot'
        ? await binanceClient.exchangeInfo()
        : await binanceClient.futuresExchangeInfo();

    this.tradeConfigs.forEach((tradeConfig) => {
      const pair = tradeConfig.asset + tradeConfig.base;

      this.loadCandles(pair, tradeConfig.loopInterval)
        .then((candles) => {
          log(`The bot trades the pair ${pair}`);

          const getCandles =
            BINANCE_MODE === 'spot'
              ? binanceClient.ws.candles
              : binanceClient.ws.futuresCandles;

          getCandles(pair, tradeConfig.loopInterval, async (candle: Candle) => {
            if (candle.isFinal) {
              candles.push({
                open: Number(candle.open),
                high: Number(candle.high),
                low: Number(candle.low),
                close: Number(candle.close),
                volume: Number(candle.volume),
                openTime: new Date(candle.startTime),
                closeTime: new Date(candle.closeTime),
              });
              candles.shift(); // Remove the first candle to work with the same length

              const trade =
                BINANCE_MODE === 'spot'
                  ? this.tradeWithSpot
                  : this.tradeWithFutures;

              if (
                tradeConfig.indicatorInterval &&
                tradeConfig.indicatorInterval !== tradeConfig.loopInterval
              ) {
                this.loadCandles(
                  pair,
                  tradeConfig.indicatorInterval,
                  true,
                  false
                ).then((candles) => trade(tradeConfig, candles, exchangeInfo));
              } else {
                trade(tradeConfig, candles, exchangeInfo);
              }
            }
          });
        })
        .catch(error);
    });
  }

  private async tradeWithSpot(
    tradeConfig: TradeConfig,
    candles: CandleData[],
    exchangeInfo: ExchangeInfo
  ) {
    const {
      asset,
      base,
      risk,
      buySignal,
      sellSignal,
      tpslStrategy,
      riskManagement,
      allowPyramiding,
      maxPyramidingAllocation,
    } = tradeConfig;
    const pair = asset + base;

    // Balance information
    const { balances } = await binanceClient.accountInfo();
    const assetBalance = Number(
      balances.find((balance) => balance.asset === asset).free
    );
    const baseBalance = Number(
      balances.find((balance) => balance.asset === base).free
    );

    // Data
    const currentPrice = candles[candles.length - 1].close;
    const currentOpenOrders = await binanceClient.openOrders({
      symbol: pair,
    });

    // Conditions
    const canBuy =
      !allowPyramiding ||
      (allowPyramiding &&
        assetBalance * currentPrice <= baseBalance * maxPyramidingAllocation);

    // Precisions
    const pricePrecision = getPricePrecision(pair, exchangeInfo);
    const quantityPrecision = getQuantityPrecision(pair, exchangeInfo);

    // If a trade exists, search when to sell
    if (assetBalance > 0) {
      if (sellSignal(candles)) {
        binanceClient
          .order({
            side: OrderSide.SELL,
            type: OrderType.MARKET,
            symbol: pair,
            quantity: String(assetBalance),
            recvWindow: 60000,
          })
          .then(() => {
            this.closeOpenOrders(pair);
            const totalValue = currentPrice * Number(assetBalance);
            log(`Sells ${assetBalance}${asset} for ${totalValue}${base}.`);
          })
          .catch(error);
      }
    } else if (canBuy && buySignal(candles)) {
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
          recvWindow: 60000,
          timeInForce: 'GTC',
        })
        .then(({ price: orderPrice }) => {
          // @NOTES => calculate the average price

          // Calculate the tp and sl
          const { takeProfits, stopLoss } = tpslStrategy
            ? tpslStrategy(currentPrice, candles, pricePrecision, OrderSide.BUY)
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
                recvWindow: 60000,
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
                    type: OrderType.LIMIT,
                    symbol: pair,
                    price: String(price),
                    quantity: String(
                      decimalFloor(
                        quantity * quantityPercentage,
                        quantityPrecision
                      )
                    ),
                    recvWindow: 60000,
                  })
                  .catch(error);
              });
            }

            if (stopLoss) {
              // Sell limit order as SL
              binanceClient
                .order({
                  side: OrderSide.SELL,
                  type: OrderType.LIMIT,
                  symbol: pair,
                  price: String(stopLoss),
                  quantity: String(quantity),
                  recvWindow: 60000,
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

  private async tradeWithFutures(
    tradeConfig: TradeConfig,
    candles: CandleData[],
    exchangeInfo: ExchangeInfo
  ) {
    const {
      asset,
      base,
      risk,
      buySignal,
      sellSignal,
      tpslStrategy,
      trendFilter,
      riskManagement,
      trailingStopConfig,
      allowPyramiding,
      maxPyramidingAllocation,
      unidirectional,
    } = tradeConfig;
    const pair = asset + base;

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

    // Other data
    const currentPrice = candles[candles.length - 1].close;
    const currentOpenOrders = await binanceClient.futuresOpenOrders({
      symbol: pair,
    });
    const pricePrecision = getPricePrecision(pair, exchangeInfo);
    const quantityPrecision = getQuantityPrecision(pair, exchangeInfo);

    // Prevent remaining open orders when all the take profit or a stop loss has been filled
    if (!hasLongPosition && !hasShortPosition && currentOpenOrders.length > 0) {
      this.closeOpenOrders(pair);
    }

    if (canTakeLongPosition && buySignal(candles)) {
      // Take the profit and not open a new position
      if (hasShortPosition && unidirectional) {
        binanceClient
          .futuresOrder({
            side: OrderSide.BUY,
            type: OrderType.MARKET,
            symbol: pair,
            quantity: String(positionSize),
            recvWindow: 60000,
          })
          .then(() => {
            this.closeOpenOrders(pair);
            log(
              `Closes the short position for ${pair}. PNL: ${position.unrealizedProfit}`
            );
          });
        return;
      }

      // Do not trade with long position if the trend is down
      if (!useLongPosition) return;

      // Do not add to the current position if the allocation is over the max allocation
      if (allowPyramiding && hasLongPosition && !canAddToPosition) return;

      // Calculate TP and SL
      const { takeProfits, stopLoss } =
        !allowPyramiding && tpslStrategy
          ? tpslStrategy(currentPrice, candles, pricePrecision, OrderSide.BUY)
          : { takeProfits: [], stopLoss: null };

      if (allowPyramiding && tpslStrategy) {
        error('You cannot use take profits and stop loss in pyramiding mode');
      }

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
          recvWindow: 60000,
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

          if (takeProfits.length > 0) {
            // Create the take profit orders
            takeProfits.forEach(({ price, quantityPercentage }) => {
              // Take profit order
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
                  recvWindow: 60000,
                })
                .catch(error);
            });
          }

          if (stopLoss) {
            // Stop loss order
            binanceClient
              .futuresOrder({
                side: OrderSide.SELL,
                type: OrderType.LIMIT,
                symbol: pair,
                price: stopLoss,
                quantity: String(positionTotalSize),
                recvWindow: 60000,
              })
              .catch(error);
          }

          if (trailingStopConfig) {
            const calculateActivationPrice = (currentPrice: number) => {
              let { percentageToTP, changePercentage } =
                trailingStopConfig.activation;

              if (takeProfits.length > 0 && percentageToTP) {
                const nearestTakeProfitPrice = Math.min(
                  ...takeProfits.map((tp) => tp.price)
                );
                let delta = Math.abs(nearestTakeProfitPrice - currentPrice);
                return decimalFloor(
                  currentPrice + delta * percentageToTP,
                  pricePrecision
                );
              } else if (changePercentage) {
                return decimalFloor(
                  currentPrice * (1 + changePercentage),
                  pricePrecision
                );
              } else {
                return currentPrice;
              }
            };

            binanceClient
              .futuresOrder({
                side: OrderSide.SELL,
                type: OrderType.TRAILING_STOP_MARKET,
                symbol: pair,
                quantity: String(positionTotalSize),
                callbackRate: trailingStopConfig.callbackRate * 100,
                activationPrice: calculateActivationPrice(currentPrice),
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
    } else if (canTakeShortPosition && sellSignal(candles)) {
      // Take the profit and not open a new position
      if (hasLongPosition && unidirectional) {
        binanceClient
          .futuresOrder({
            side: OrderSide.SELL,
            type: OrderType.MARKET,
            symbol: pair,
            quantity: String(positionSize),
            recvWindow: 60000,
          })
          .then(() => {
            this.closeOpenOrders(pair);
            log(
              `Closes the long position for ${pair}. PNL: ${position.unrealizedProfit}`
            );
          });
        return;
      }

      // Do not trade with short position if the trend is up
      if (!useShortPosition) return;

      // Do not add to the current position if the allocation is over the max allocation
      if (allowPyramiding && hasShortPosition && !canAddToPosition) return;

      // Calculate TP and SL
      const { takeProfits, stopLoss } =
        !allowPyramiding && tpslStrategy
          ? tpslStrategy(currentPrice, candles, pricePrecision, OrderSide.SELL)
          : { takeProfits: [], stopLoss: null };

      if (allowPyramiding && tpslStrategy) {
        error('You cannot use take profits and stop loss in pyramiding mode');
      }

      // Risk Management
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
          recvWindow: 60000,
        })
        .then(async () => {
          // Cancel the previous orders to update them
          if (currentOpenOrders.length > 0) {
            this.closeOpenOrders(pair);
          }

          // Calculate the total size and the average entry price on the position updated
          const positionTotalSize = positionSize + quantity;
          const avgPrice =
            (positionSize * positionEntryPrice + quantity * currentPrice) /
            (positionSize + quantity);

          if (takeProfits.length > 0) {
            // Create the take profit orders
            takeProfits.forEach(({ price, quantityPercentage }) => {
              // Take profit order
              binanceClient
                .futuresOrder({
                  side: OrderSide.BUY,
                  type: OrderType.LIMIT,
                  symbol: pair,
                  price: price,
                  stopPrice: price,
                  quantity: String(
                    decimalFloor(
                      Number(positionTotalSize) * quantityPercentage,
                      quantityPrecision
                    )
                  ),
                  recvWindow: 60000,
                })
                .catch(error);
            });
          }

          if (stopLoss) {
            // Stop loss order
            binanceClient
              .futuresOrder({
                side: OrderSide.BUY,
                type: OrderType.LIMIT,
                symbol: pair,
                price: stopLoss,
                quantity: String(positionTotalSize),
                recvWindow: 60000,
              })
              .catch(error);
          }

          if (trailingStopConfig) {
            const calculateActivationPrice = (currentPrice: number) => {
              let { percentageToTP, changePercentage } =
                trailingStopConfig.activation;

              if (takeProfits.length > 0 && percentageToTP) {
                const nearestTakeProfitPrice = Math.max(
                  ...takeProfits.map((tp) => tp.price)
                );
                let delta = Math.abs(currentPrice - nearestTakeProfitPrice);
                return decimalCeil(
                  currentPrice - delta * percentageToTP,
                  pricePrecision
                );
              } else if (changePercentage) {
                return decimalCeil(
                  currentPrice * (1 - changePercentage),
                  pricePrecision
                );
              } else {
                return currentPrice;
              }
            };

            binanceClient
              .futuresOrder({
                side: OrderSide.BUY,
                type: OrderType.TRAILING_STOP_MARKET,
                symbol: pair,
                quantity: String(positionTotalSize),
                callbackRate: trailingStopConfig.callbackRate * 100,
                activationPrice: calculateActivationPrice(currentPrice),
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

  private loadCandles(
    symbol: string,
    interval: CandleChartInterval,
    onlyFinalCandle = true,
    displayLog = true
  ) {
    return new Promise<CandleData[]>((resolve, reject) => {
      const getCandles =
        BINANCE_MODE === 'spot'
          ? binanceClient.candles
          : binanceClient.futuresCandles;

      getCandles({ symbol, interval })
        .then((candles) => {
          if (displayLog)
            log(`Load successfully the candles for the pair ${symbol}`);
          resolve(
            candles
              .slice(0, onlyFinalCandle ? -1 : candles.length)
              .map((candle) => ({
                open: Number(candle.open),
                high: Number(candle.high),
                low: Number(candle.low),
                close: Number(candle.close),
                volume: Number(candle.volume),
                openTime: new Date(candle.openTime),
                closeTime: new Date(candle.closeTime),
              }))
          );
        })
        .catch(reject);
    });
  }

  private closeOpenOrders(symbol: string) {
    return new Promise<void>((resolve, reject) => {
      const cancel =
        BINANCE_MODE === 'spot'
          ? binanceClient.cancelOpenOrders
          : binanceClient.futuresCancelAllOpenOrders;

      cancel({ symbol })
        .then(() => {
          log(`Close all open orders for the pair ${symbol}`);
          resolve();
        })
        .catch(reject);
    });
  }
}
