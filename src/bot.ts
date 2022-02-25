import {
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

    const getCandles =
      BINANCE_MODE === 'spot'
        ? binanceClient.ws.candles
        : binanceClient.ws.futuresCandles;

    this.tradeConfigs.forEach((tradeConfig) => {
      const pair = tradeConfig.asset + tradeConfig.base;
      log(`The bot trades the pair ${pair}`);

      getCandles(pair, tradeConfig.loopInterval, (candle) => {
        if (candle.isFinal) {
          let loadTimeFrames: Promise<CandlesDataMultiTimeFrames>[] = [];

          tradeConfig.indicatorIntervals.forEach(
            (interval: CandleChartInterval) => {
              loadTimeFrames.push(
                new Promise<CandlesDataMultiTimeFrames>((resolve, reject) => {
                  this.loadCandles(pair, interval, true, false)
                    .then((candles) => {
                      resolve({
                        interval,
                        candles: candles.map((candle) => ({
                          open: Number(candle.open),
                          high: Number(candle.high),
                          low: Number(candle.low),
                          close: Number(candle.close),
                          volume: Number(candle.volume),
                          openTime: new Date(candle.openTime),
                          closeTime: new Date(candle.closeTime),
                        })),
                      });
                    })
                    .catch(reject);
                })
              );
            }
          );

          // For each stream event, get all the candle data in all the indicator time frames from the config
          Promise.all(loadTimeFrames).then((candlesMultiTimeFrames) => {
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
          });
        }
      });
    });
  }

  private async tradeWithSpot(
    tradeConfig: TradeConfig,
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

    // Open orders
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
      if (sellStrategy(candles)) {
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
            log(
              `Sell ${assetBalance}${asset} at the price ${currentPrice} for ${totalValue}${base}.`
            );
          })
          .catch(error);
      }
    } else if (canBuy && buyStrategy(candles)) {
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
    const hadLongPosition = Number(position.positionAmt) > 0;
    const hadShortPosition = Number(position.positionAmt) < 0;
    const positionSize = Math.abs(Number(position.positionAmt));
    const positionEntryPrice = Number(position.entryPrice);

    // Conditions to take or not a position
    const canAddToPosition = allowPyramiding
      ? Number(position.initialMargin) + Number(assetBalance) * risk <=
        Number(assetBalance) * maxPyramidingAllocation
      : false;
    const canTakeLongPosition =
      (!allowPyramiding && !hadLongPosition) || allowPyramiding;
    const canTakeShortPosition =
      (!allowPyramiding && !hadShortPosition) || allowPyramiding;

    // Other data
    const currentOpenOrders = await binanceClient.futuresOpenOrders({
      symbol: pair,
    });
    const pricePrecision = getPricePrecision(pair, exchangeInfo);
    const quantityPrecision = getQuantityPrecision(pair, exchangeInfo);

    // Prevent remaining open orders when all the take profit or a stop loss has been filled
    if (!hadLongPosition && !hadShortPosition && currentOpenOrders.length > 0) {
      this.closeOpenOrders(pair);
    }

    if (canTakeLongPosition && buyStrategy(candles)) {
      // Take the profit and not open a new position
      if (hadShortPosition && unidirectional) {
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
              `Close the short position on ${pair}. PNL: ${position.unrealizedProfit}`
            );
          });
        return;
      }

      // Do not trade with long position if the trend is down
      if (!useLongPosition) return;

      // Do not add to the current position if the allocation is over the max allocation
      if (allowPyramiding && hadLongPosition && !canAddToPosition) return;

      // Do not close the current short position built progressively in pyramiding mode
      if (allowPyramiding && hadShortPosition) return;

      // Calculate TP and SL
      let { takeProfits, stopLoss } = exitStrategy
        ? exitStrategy(currentPrice, candles, pricePrecision, OrderSide.BUY)
        : { takeProfits: [], stopLoss: null };

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
      let previousPositionQuantity = hadShortPosition ? positionSize : 0;

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

          // In pyramiding mode, update the take profits and stop loss
          if (allowPyramiding && hadLongPosition) {
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
                activationPrice: calculateActivationPrice(avgPrice),
              })
              .catch(error);
          }

          if (hadLongPosition) {
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
    } else if (canTakeShortPosition && sellStrategy(candles)) {
      // Take the profit and not open a new position
      if (hadLongPosition && unidirectional) {
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
              `Close the long position on ${pair}. PNL: ${position.unrealizedProfit}`
            );
          });
        return;
      }

      // Do not trade with short position if the trend is up
      if (!useShortPosition) return;

      // Do not add to the current position if the allocation is over the max allocation
      if (allowPyramiding && hadShortPosition && !canAddToPosition) return;

      // Do not close the current long position built progressively in pyramiding mode
      if (allowPyramiding && hadLongPosition) return;

      // Calculate TP and SL
      let { takeProfits, stopLoss } = exitStrategy
        ? exitStrategy(currentPrice, candles, pricePrecision, OrderSide.SELL)
        : { takeProfits: [], stopLoss: null };

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
      let previousPositionQuantity = hadLongPosition ? positionSize : 0;

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
          if (allowPyramiding && hadShortPosition) {
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
              // Take profit order
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
                activationPrice: calculateActivationPrice(avgPrice),
              })
              .catch(error);
          }

          if (hadShortPosition) {
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
