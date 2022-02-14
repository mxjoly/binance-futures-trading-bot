import {
  Candle,
  CandleChartInterval,
  ExchangeInfo,
  OrderSide,
  OrderType,
} from 'binance-api-node';
import {
  calculateAllocationQuantity,
  getPricePrecision,
  getQuantityPrecision,
  isBuySignal,
  isSellSignal,
  isValidQuantity,
  buildCandle,
  decimalFloor,
} from './utils';
import { log, error, logBuySellExecutionOrder } from './log';
import { binanceClient } from '.';

// ====================================================================== //

export // The bot will trade with the binance :
const BINANCE_MODE: BinanceMode = 'futures';

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
              candles.push(buildCandle(candle));
              candles = candles.slice(1); // Work with the same length

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
    candles: ChartCandle[],
    exchangeInfo: ExchangeInfo
  ) {
    const {
      asset,
      base,
      allocation,
      buyStrategy,
      sellStrategy,
      tpslStrategy,
      allowPyramiding,
      maxPyramidingAllocation,
    } = tradeConfig;
    const pair = `${asset}${base}`;

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
    const currentTrades = await binanceClient.myTrades({ symbol: pair });
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

    // Close remaining open orders while doesn't trade on the symbol
    if (currentTrades.length === 0 && currentOpenOrders.length > 0) {
      this.closeOpenOrders(pair);
    }

    // If a trade exists, search when to sell
    if (currentTrades.length > 0) {
      if (isSellSignal(candles, sellStrategy)) {
        currentTrades.forEach((trade) => {
          binanceClient
            .order({
              side: OrderSide.SELL,
              type: OrderType.MARKET,
              symbol: trade.symbol,
              quantity: trade.qty,
              recvWindow: 60000,
            })
            .then(() => {
              this.closeOpenOrders(pair);
              const totalValue = currentPrice * Number(trade.qty);
              const gains =
                totalValue - Number(trade.price) * Number(trade.qty);
              log(
                `Sells ${trade.qty}${asset} for ${totalValue}${base}. Gains: ${gains}${base}`
              );
            })
            .catch(error);
        });
      }
    } else if (canBuy && isBuySignal(candles, buyStrategy)) {
      const quantity = await calculateAllocationQuantity(
        asset,
        base,
        baseBalance,
        allocation,
        currentPrice,
        exchangeInfo
      );

      // Buy market order
      binanceClient
        .order({
          side: OrderSide.BUY,
          type: OrderType.MARKET,
          symbol: pair,
          quantity: String(quantity),
          recvWindow: 60000,
        })
        .then(({ executedQty, price: orderPrice }) => {
          // If there is always a trade, get the average price
          let avgPrice =
            currentTrades.length > 0
              ? currentTrades.reduce(
                  (previous, current) =>
                    (previous += Number(current.price) * Number(current.qty)),
                  Number(executedQty) * Number(orderPrice)
                ) /
                (assetBalance + Number(executedQty))
              : currentPrice;

          // Calculate the tp ans sl
          const { takeProfits, stopLosses } = tpslStrategy
            ? tpslStrategy(avgPrice, candles, pricePrecision, OrderSide.BUY)
            : { takeProfits: [], stopLosses: [] };

          // Remove the current open orders to update them
          if (currentOpenOrders.length > 0) this.closeOpenOrders(pair);

          return { orderPrice, avgPrice, takeProfits, stopLosses };
        })
        .then(({ orderPrice, avgPrice, stopLosses, takeProfits }) => {
          if (takeProfits.length === 1 && stopLosses.length === 1) {
            // Sell oco order as TP/SL
            binanceClient
              .orderOco({
                side: OrderSide.SELL,
                symbol: pair,
                price: String(takeProfits[0].price),
                stopPrice: String(stopLosses[0].price),
                stopLimitPrice: String(stopLosses[0].price),
                quantity: String(
                  decimalFloor(
                    quantity * takeProfits[0].quantityPercentage,
                    quantityPrecision
                  )
                ),
                recvWindow: 60000,
              })
              .catch(error);
          } else if (takeProfits.length > 0 || stopLosses.length > 0) {
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

            // Create all the stop loss targets
            stopLosses.forEach(({ price, quantityPercentage }) => {
              // Sell limit order as SL
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

          logBuySellExecutionOrder(
            OrderSide.BUY,
            asset,
            base,
            Number(orderPrice),
            quantity,
            takeProfits,
            stopLosses
          );

          // Display the average price for the asset
          if (currentTrades.length > 0)
            log(`Your average price for ${asset} is now at ${avgPrice}${base}`);
        })
        .catch(error);
    }
  }

  private async tradeWithFutures(
    tradeConfig: TradeConfig,
    candles: ChartCandle[],
    exchangeInfo: ExchangeInfo
  ) {
    const {
      asset,
      base,
      allocation,
      buyStrategy,
      sellStrategy,
      tpslStrategy,
      trendFilter,
      useTrailingStop,
      trailingStopCallbackRate,
      allowPyramiding,
      maxPyramidingAllocation,
      unidirectional,
    } = tradeConfig;
    const pair = `${asset}${base}`;

    const useLongPosition = trendFilter ? trendFilter(candles) === 1 : true;
    const useShortPosition = trendFilter ? trendFilter(candles) === -1 : true;

    // Balance information
    const balances = await binanceClient.futuresAccountBalance();
    const { balance, availableBalance } = balances.find(
      (balance) => balance.asset === base
    );

    // Position information
    const { positions } = await binanceClient.futuresAccountInfo();
    const position = positions.find((position) => position.symbol === pair);
    const hasLongPosition = Number(position.positionAmt) > 0;
    const hasShortPosition = Number(position.positionAmt) < 0;

    // Conditions
    const canAddToPosition = allowPyramiding
      ? Number(position.initialMargin) + Number(balance) * allocation <=
        Number(balance) * maxPyramidingAllocation
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

    if (canTakeLongPosition && isBuySignal(candles, buyStrategy)) {
      // Take the profit and not open a new position
      if (hasShortPosition && unidirectional) {
        binanceClient
          .futuresOrder({
            side: OrderSide.BUY,
            type: OrderType.MARKET,
            symbol: pair,
            quantity: position.positionAmt,
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

      // Do not trade with long position if the strategy is disabled
      if (!useLongPosition) return;

      // Do not add to the current position if the allocation is over the max allocation
      if (allowPyramiding && hasLongPosition && !canAddToPosition) return;

      let quantity = await calculateAllocationQuantity(
        asset,
        base,
        allowPyramiding ? Number(balance) : Number(availableBalance),
        allocation * (tradeConfig.leverage || 1),
        currentPrice,
        exchangeInfo
      );

      // Quantity to add to close the previous position
      let previousPositionQuantity = hasShortPosition
        ? Number(position.positionAmt)
        : 0;

      // To close the previous short position
      if (
        isValidQuantity(quantity - previousPositionQuantity, pair, exchangeInfo)
      ) {
        quantity -= previousPositionQuantity;
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
        .then(async ({ executedQty }) => {
          // Cancel the previous orders to update them
          if (currentOpenOrders.length > 0) {
            this.closeOpenOrders(pair);
          }

          // Get the total size and the entry price on the position updated
          const { positionAmt: positionSize, entryPrice: avgPrice } = (
            await binanceClient.futuresAccountInfo()
          ).positions.find((position) => position.symbol === pair);

          // Calculate the tp and sl
          const { takeProfits, stopLosses } = tpslStrategy
            ? tpslStrategy(
                Number(avgPrice),
                candles,
                pricePrecision,
                OrderSide.BUY
              )
            : { takeProfits: [], stopLosses: [] };

          if (useTrailingStop) {
            if (!trailingStopCallbackRate) {
              error(
                'Cannot use trailing stop because property trailingStopCallbackRate is not defined'
              );
            } else {
              binanceClient
                .futuresOrder({
                  side: OrderSide.SELL,
                  type: OrderType.TRAILING_STOP_MARKET,
                  symbol: pair,
                  quantity: positionSize,
                  callbackRate: trailingStopCallbackRate * 100,
                  activationPrice:
                    candles[candles.length - 1].close *
                    (1 + trailingStopCallbackRate),
                })
                .catch(error);
            }
          }

          if (takeProfits.length > 0 && !useTrailingStop) {
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
                      Number(positionSize) * quantityPercentage,
                      quantityPrecision
                    )
                  ),
                  recvWindow: 60000,
                })
                .catch(error);
            });
          }

          if (stopLosses.length > 0) {
            // Create the stop loss orders
            stopLosses.forEach(({ price, quantityPercentage }) => {
              // Stop loss order
              binanceClient
                .futuresOrder({
                  side: OrderSide.SELL,
                  type: OrderType.LIMIT,
                  symbol: pair,
                  price: price,
                  quantity: String(
                    decimalFloor(
                      Number(positionSize) * quantityPercentage,
                      quantityPrecision
                    )
                  ),
                  recvWindow: 60000,
                })
                .catch(error);
            });
          }

          if (hasLongPosition) {
            log(
              `Adds ${Number(
                executedQty
              )}${asset} to the size of the long position on ${pair}. The average enter price is now ${avgPrice}${base} and the total size ${positionSize}${asset}`
            );
          } else {
            logBuySellExecutionOrder(
              OrderSide.BUY,
              asset,
              base,
              currentPrice,
              Number(positionSize),
              takeProfits,
              stopLosses
            );
          }
        })
        .catch(error);
    } else if (canTakeShortPosition && isSellSignal(candles, sellStrategy)) {
      // Take the profit and not open a new position
      if (hasLongPosition && unidirectional) {
        binanceClient
          .futuresOrder({
            side: OrderSide.SELL,
            type: OrderType.MARKET,
            symbol: pair,
            quantity: position.positionAmt,
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

      // Do not trade with short position if the strategy is disabled
      if (!useShortPosition) return;

      // Do not add to the current position if the allocation is over the max allocation
      if (allowPyramiding && hasShortPosition && !canAddToPosition) return;

      let quantity = await calculateAllocationQuantity(
        asset,
        base,
        allowPyramiding ? Number(balance) : Number(availableBalance),
        allocation * (tradeConfig.leverage || 1),
        currentPrice,
        exchangeInfo
      );

      // Quantity to add to close the previous position
      let previousPositionQuantity = hasLongPosition
        ? Number(position.positionAmt)
        : 0;

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
        .then(async ({ executedQty }) => {
          // Cancel the previous orders to update them
          if (currentOpenOrders.length > 0) {
            this.closeOpenOrders(pair);
          }

          // Get the total size and the entry price on the position updated
          const { positionAmt: positionSize, entryPrice: avgPrice } = (
            await binanceClient.futuresAccountInfo()
          ).positions.find((position) => position.symbol === pair);

          // Calculate the tp and sl
          const { takeProfits, stopLosses } = tpslStrategy
            ? tpslStrategy(
                Number(avgPrice),
                candles,
                pricePrecision,
                OrderSide.SELL
              )
            : { takeProfits: [], stopLosses: [] };

          if (useTrailingStop) {
            if (!trailingStopCallbackRate) {
              error(
                'Cannot use trailing stop because property trailingStopCallbackRate is not defined'
              );
            } else {
              binanceClient
                .futuresOrder({
                  side: OrderSide.BUY,
                  type: OrderType.TRAILING_STOP_MARKET,
                  symbol: pair,
                  quantity: positionSize,
                  callbackRate: trailingStopCallbackRate * 100,
                  activationPrice:
                    candles[candles.length - 1].close *
                    (1 - trailingStopCallbackRate),
                })
                .catch(error);
            }
          }

          if (takeProfits.length > 0 && !useTrailingStop) {
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
                      Number(positionSize) * quantityPercentage,
                      quantityPrecision
                    )
                  ),
                  recvWindow: 60000,
                })
                .catch(error);
            });
          }

          if (stopLosses.length > 0) {
            // Create the stop loss orders
            stopLosses.forEach(({ price, quantityPercentage }) => {
              // Stop loss order
              binanceClient
                .futuresOrder({
                  side: OrderSide.BUY,
                  type: OrderType.LIMIT,
                  symbol: pair,
                  price: price,
                  stopPrice: price,
                  quantity: String(
                    decimalFloor(
                      Number(positionSize) * quantityPercentage,
                      quantityPrecision
                    )
                  ),
                  recvWindow: 60000,
                })
                .catch(error);
            });
          }

          if (hasShortPosition) {
            log(
              `Adds ${Number(
                executedQty
              )}${asset} to the size of the short position on ${pair}. The average enter price is now ${avgPrice}${base} and the total size ${positionSize}${asset}`
            );
          } else {
            logBuySellExecutionOrder(
              OrderSide.SELL,
              asset,
              base,
              currentPrice,
              Number(positionSize),
              takeProfits,
              stopLosses
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
    return new Promise<ChartCandle[]>((resolve, reject) => {
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
              .map((candle) => buildCandle(candle))
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
