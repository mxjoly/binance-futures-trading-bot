import {
  Account,
  Binance,
  Candle,
  CandleChartInterval,
  ExchangeInfo,
  FuturesAccountInfoResult,
  OrderSide,
  OrderType,
} from 'binance-api-node';
import { BINANCE_MODE } from './config';
import {
  calculateAllocationQuantity,
  getPricePrecision,
  getQuantityPrecision,
  isBuySignal,
  isSellSignal,
  isValidQuantity,
  buildCandle,
  decimalFloor,
  error,
  log,
} from './utils';

// ====================================================================== //

export class Bot {
  private binanceClient: Binance;
  private exchangeInfo: ExchangeInfo;
  private tradeConfigs: TradeConfig[];

  constructor(binanceClient: Binance, tradeConfigs: TradeConfig[]) {
    this.binanceClient = binanceClient;
    this.tradeConfigs = tradeConfigs;
  }

  public async prepare() {
    if (BINANCE_MODE === 'futures') {
      // Set the margin type and initial leverage for the futures
      this.tradeConfigs.forEach((tradeConfig) => {
        const pair = tradeConfig.asset + tradeConfig.base;

        this.binanceClient
          .futuresLeverage({
            symbol: pair,
            leverage: tradeConfig.leverage || 1,
          })
          .then(() =>
            log(`Leverage for ${pair} is set to ${tradeConfig.leverage || 1}`)
          )
          .catch(error);

        this.binanceClient
          .futuresMarginType({
            symbol: pair,
            marginType: 'ISOLATED',
          })
          .catch(error);
      });
    }

    this.exchangeInfo =
      BINANCE_MODE === 'spot'
        ? await this.binanceClient.exchangeInfo()
        : await this.binanceClient.futuresExchangeInfo();
  }

  public async run() {
    log(
      '====================== 💵 BINANCE BOT TRADING 💵 ======================'
    );

    this.tradeConfigs.forEach((tradeConfig) => {
      const pair = tradeConfig.asset + tradeConfig.base;

      this.loadCandles(pair, tradeConfig.loopInterval)
        .then((candles) => {
          log(`The bot trades the pair ${pair}`);

          const getCandles =
            BINANCE_MODE === 'spot'
              ? this.binanceClient.ws.candles
              : this.binanceClient.ws.futuresCandles;

          getCandles(pair, tradeConfig.loopInterval, async (candle: Candle) => {
            if (candle.isFinal) {
              candles.push(buildCandle(candle));
              candles = candles.slice(1); // Work with the same length

              const trade =
                BINANCE_MODE === 'spot'
                  ? this.tradeWithSpot
                  : this.tradeWithFutures;

              if (tradeConfig.indicatorInterval !== tradeConfig.loopInterval) {
                this.loadCandles(
                  pair,
                  tradeConfig.indicatorInterval,
                  true,
                  false
                ).then((candles) => trade(tradeConfig, candles));
              } else {
                trade(tradeConfig, candles);
              }
            }
          });
        })
        .catch(error);
    });
  }

  private async tradeWithSpot(
    tradeConfig: TradeConfig,
    candles: ChartCandle[]
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
    const { balances } = await this.binanceClient.accountInfo();
    const assetBalance = Number(
      balances.find((balance) => balance.asset === asset).free
    );
    const baseBalance = Number(
      balances.find((balance) => balance.asset === base).free
    );

    // Data
    const currentPrice = candles[candles.length - 1].close;
    const currentTrades = await this.binanceClient.myTrades({ symbol: pair });
    const currentOpenOrders = await this.binanceClient.openOrders({
      symbol: pair,
    });

    // Conditions
    const canBuy =
      !allowPyramiding ||
      (allowPyramiding &&
        assetBalance * currentPrice <= baseBalance * maxPyramidingAllocation);

    // Precisions
    const pricePrecision = getPricePrecision(pair, this.exchangeInfo);
    const quantityPrecision = getQuantityPrecision(pair, this.exchangeInfo);

    // Close remaining open orders while doesn't trade on the symbol
    if (currentTrades.length === 0 && currentOpenOrders.length > 0) {
      this.closeOpenOrders(pair);
    }

    // If a trade exists, search when to sell
    if (currentTrades.length > 0) {
      if (isSellSignal(candles, sellStrategy)) {
        currentTrades.forEach((trade) => {
          this.binanceClient
            .order({
              side: OrderSide.SELL,
              type: OrderType.MARKET,
              symbol: trade.symbol,
              quantity: trade.qty,
              recvWindow: 60000,
            })
            .then(() => {
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
        this.exchangeInfo
      );

      // Buy market order
      this.binanceClient
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
            ? tpslStrategy({
                price: avgPrice,
                candles,
                tradeConfig,
                pricePrecision,
                side: OrderSide.BUY,
              })
            : { takeProfits: [], stopLosses: [] };

          // Remove the current open orders to update them
          if (currentOpenOrders.length > 0) this.closeOpenOrders(pair);

          return { orderPrice, avgPrice, takeProfits, stopLosses };
        })
        .then(({ orderPrice, avgPrice, stopLosses, takeProfits }) => {
          if (takeProfits.length === 1 && stopLosses.length === 1) {
            // Sell oco order as TP/SL
            this.binanceClient
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
              this.binanceClient
                .order({
                  side: OrderSide.SELL,
                  type: OrderType.TAKE_PROFIT_LIMIT,
                  symbol: pair,
                  price: String(price),
                  stopPrice: String(price),
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
              this.binanceClient
                .order({
                  side: OrderSide.SELL,
                  type: OrderType.STOP_LOSS_LIMIT,
                  symbol: pair,
                  price: String(price),
                  stopPrice: String(price),
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

          this.logBuySellExecutionOrder(
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
    candles: ChartCandle[]
  ) {
    const {
      asset,
      base,
      allocation,
      buyStrategy,
      sellStrategy,
      tpslStrategy,
      checkTrend,
      useTrailingStop,
      trailingStopCallbackRate,
      allowPyramiding,
      maxPyramidingAllocation,
      unidirectional,
    } = tradeConfig;
    const pair = `${asset}${base}`;

    const useLongPosition = checkTrend ? checkTrend(candles) : true;
    const useShortPosition = checkTrend ? !useLongPosition : true;

    // Balance information
    const balances = await this.binanceClient.futuresAccountBalance();
    const { balance, availableBalance } = balances.find(
      (balance) => balance.asset === base
    );

    // Position information
    const { positions } = await this.binanceClient.futuresAccountInfo();
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
    const currentOpenOrders = await this.binanceClient.futuresOpenOrders({
      symbol: pair,
    });
    const pricePrecision = getPricePrecision(pair, this.exchangeInfo);
    const quantityPrecision = getQuantityPrecision(pair, this.exchangeInfo);

    // Prevent remaining open orders when all the take profit or a stop loss has been filled
    if (!hasLongPosition && !hasShortPosition && currentOpenOrders.length > 0) {
      this.closeOpenOrders(pair);
    }

    if (canTakeLongPosition && isBuySignal(candles, buyStrategy)) {
      // Take the profit and not open a new position
      if (hasShortPosition && unidirectional) {
        this.binanceClient
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
        this.exchangeInfo
      );

      // Quantity to add to close the previous position
      let previousPositionQuantity = hasShortPosition
        ? Number(position.positionAmt)
        : 0;

      // To close the previous short position
      if (
        isValidQuantity(
          quantity - previousPositionQuantity,
          pair,
          this.exchangeInfo
        )
      ) {
        quantity -= previousPositionQuantity;
      } else {
        throw new Error(`Invalid quantity order for ${pair}: ${quantity}`);
      }

      this.binanceClient
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
            await this.binanceClient.futuresAccountInfo()
          ).positions.find((position) => position.symbol === pair);

          // Calculate the tp and sl
          const { takeProfits, stopLosses } = tpslStrategy
            ? tpslStrategy({
                price: Number(avgPrice),
                candles,
                tradeConfig,
                pricePrecision,
                side: OrderSide.BUY,
              })
            : { takeProfits: [], stopLosses: [] };

          if (useTrailingStop) {
            if (!trailingStopCallbackRate) {
              error(
                'Cannot use trailing stop because property trailingStopCallbackRate is not defined'
              );
            } else {
              this.binanceClient
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
              this.binanceClient
                .futuresOrder({
                  side: OrderSide.SELL,
                  type: OrderType.TAKE_PROFIT_LIMIT,
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
              this.binanceClient
                .futuresOrder({
                  side: OrderSide.SELL,
                  type: OrderType.STOP_LOSS_LIMIT,
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

          if (hasLongPosition) {
            log(
              `Adds ${Number(
                executedQty
              )}${asset} to the size of the long position on ${pair}. The average enter price is now ${avgPrice}${base} and the total size ${positionSize}${asset}`
            );
          } else {
            this.logBuySellExecutionOrder(
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
        this.binanceClient
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
        this.exchangeInfo
      );

      // Quantity to add to close the previous position
      let previousPositionQuantity = hasLongPosition
        ? Number(position.positionAmt)
        : 0;

      // To close the previous long position
      if (
        isValidQuantity(
          quantity + previousPositionQuantity,
          pair,
          this.exchangeInfo
        )
      ) {
        quantity += previousPositionQuantity;
      } else {
        throw new Error(`Invalid quantity order for ${pair}: ${quantity}`);
      }

      this.binanceClient
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
            await this.binanceClient.futuresAccountInfo()
          ).positions.find((position) => position.symbol === pair);

          // Calculate the tp and sl
          const { takeProfits, stopLosses } = tpslStrategy
            ? tpslStrategy({
                price: Number(avgPrice),
                candles,
                tradeConfig,
                pricePrecision,
                side: OrderSide.SELL,
              })
            : { takeProfits: [], stopLosses: [] };

          if (useTrailingStop) {
            if (!trailingStopCallbackRate) {
              error(
                'Cannot use trailing stop because property trailingStopCallbackRate is not defined'
              );
            } else {
              this.binanceClient
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
              this.binanceClient
                .futuresOrder({
                  side: OrderSide.BUY,
                  type: OrderType.TAKE_PROFIT_LIMIT,
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
              this.binanceClient
                .futuresOrder({
                  side: OrderSide.BUY,
                  type: OrderType.STOP_LOSS_LIMIT,
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
            this.logBuySellExecutionOrder(
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

  private logBuySellExecutionOrder(
    orderSide: OrderSide,
    asset: string,
    base: string,
    price: number,
    quantity: number,
    takeProfits: { price: number; quantityPercentage: number }[],
    stopLosses: { price: number; quantityPercentage: number }[]
  ) {
    let introPhrase =
      BINANCE_MODE === 'spot'
        ? `${
            orderSide === OrderSide.BUY ? 'Buys' : 'Sells'
          } ${quantity}${asset} at the price ${price}${base}`
        : `Opens a ${
            orderSide === OrderSide.BUY ? 'long' : 'short'
          } position on ${asset}${base} at the price ${price} with a size of ${quantity}${asset}`;

    let tp = `TP: ${
      takeProfits.length > 0
        ? takeProfits
            .map(
              (takeProfit) =>
                `[${takeProfit.price} => ${
                  takeProfit.quantityPercentage * 100
                }%]`
            )
            .join(' ')
        : '----'
    }`;

    let sl = `SL: ${
      stopLosses.length > 0
        ? stopLosses
            .map(
              (stopLoss) =>
                `[${stopLoss.price} => ${stopLoss.quantityPercentage * 100}%]`
            )
            .join(' ')
        : '----'
    }`;

    log([introPhrase, tp, sl].join('\n'));
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
          ? this.binanceClient.candles
          : this.binanceClient.futuresCandles;

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
    const cancel =
      BINANCE_MODE === 'spot'
        ? this.binanceClient.cancelOpenOrders
        : this.binanceClient.futuresCancelAllOpenOrders;

    cancel({ symbol })
      .then(() => {
        log(`Close all open orders for the pair ${symbol}`);
      })
      .catch(error);
  }
}
