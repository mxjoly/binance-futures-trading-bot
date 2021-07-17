import {
  Account,
  Binance,
  Candle,
  CandleChartInterval,
  ExchangeInfo,
  FuturesAccountInfoResult,
} from 'binance-api-node';
import { BINANCE_MODE } from './config';
import {
  db,
  getOpenOrders,
  deleteOpenOrders,
  addOpenOrder,
  deleteOpenOrder,
  OPEN_ORDERS_PATH,
} from './db';
import {
  calculateAllocationQuantity,
  getPricePrecision,
  isBuySignal,
  isSellSignal,
  isValidQuantity,
  buildCandle,
  error,
  log,
} from './utils';

// ====================================================================== //

export class Bot {
  private binanceClient: Binance;
  private exchangeInfo: ExchangeInfo;
  private accountInfo: Account | FuturesAccountInfoResult;
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
            log(
              `@futures > Leverage for ${pair} is set to ${
                tradeConfig.leverage || 1
              }`
            )
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

    // Close the last open orders
    if (db.exists(OPEN_ORDERS_PATH)) {
      const orders = db.getObject(OPEN_ORDERS_PATH);
      Object.keys(orders).forEach((symbol) => this.closeOpenOrders(symbol));
    }
  }

  public async run() {
    log(
      '====================== 💵 BINANCE BOT TRADING 💵 ======================'
    );

    this.tradeConfigs.forEach((tradeConfig) => {
      const pair = tradeConfig.asset + tradeConfig.base;

      this.loadCandles(pair, tradeConfig.interval)
        .then((candles) => {
          log(`@${BINANCE_MODE} > The bot trades the pair ${pair}`);

          const getCandles =
            BINANCE_MODE === 'spot'
              ? this.binanceClient.ws.candles
              : // @ts-ignore
                this.binanceClient.ws.futuresCandles;

          getCandles(pair, tradeConfig.interval, async (candle: Candle) => {
            this.checkOpenOrders(pair, Number(candle.close));

            if (candle.isFinal) {
              this.accountInfo =
                BINANCE_MODE === 'spot'
                  ? await this.binanceClient.accountInfo()
                  : await this.binanceClient.futuresAccountInfo();

              candles.push(buildCandle(candle));
              candles = candles.slice(1);

              if (BINANCE_MODE === 'spot') {
                this.tradeWithSpot(tradeConfig, candles);
              } else {
                this.tradeWithFutures(tradeConfig, candles);
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

    // Ge the available balance of base asset
    const { balances } = this.accountInfo as Account;
    const baseAvailableBalance = Number(
      balances.find((balance) => balance.asset === base).free
    );
    const assetAvailableBalance = Number(
      balances.find((balance) => balance.asset === asset).free
    );

    const price = Number((await this.binanceClient.prices())[pair]);
    const canBuy =
      !allowPyramiding ||
      (allowPyramiding &&
        assetAvailableBalance * price <=
          baseAvailableBalance * maxPyramidingAllocation);

    const pricePrecision = getPricePrecision(pair, this.exchangeInfo);
    const currentPrice = candles[candles.length - 1].close;
    const currentTrades = await this.binanceClient.myTrades({ symbol: pair });

    // If a trade exists, search when to sell
    if (currentTrades.length > 0) {
      if (isSellSignal(candles, sellStrategy)) {
        currentTrades.forEach((trade) => {
          this.binanceClient
            .order({
              side: 'SELL',
              type: 'MARKET',
              symbol: trade.symbol,
              quantity: trade.qty,
              recvWindow: 60000,
            })
            .then(() => {
              log(
                `@spot > Sells ${asset} to ${base}. Gain: ${
                  currentPrice * Number(trade.qty) -
                  Number(trade.price) * Number(trade.qty)
                }`
              );
            })
            .catch(error);
        });
      }
    } else if (canBuy) {
      if (isBuySignal(candles, buyStrategy)) {
        const { takeProfitPrice, stopLossPrice } = tpslStrategy
          ? tpslStrategy({
              candles,
              tradeConfig,
              pricePrecision,
              side: 'BUY',
            })
          : { takeProfitPrice: null, stopLossPrice: null };

        const quantity = await calculateAllocationQuantity(
          asset,
          base,
          baseAvailableBalance,
          allocation,
          currentPrice,
          this.exchangeInfo
        );

        // Buy limit order
        this.binanceClient
          .order({
            side: 'BUY',
            type: 'MARKET',
            symbol: pair,
            quantity: String(quantity),
            recvWindow: 60000,
          })
          .then(() => {
            if (takeProfitPrice && stopLossPrice) {
              // Sell oco order as TP/SL
              this.binanceClient
                .orderOco({
                  side: 'SELL',
                  symbol: pair,
                  price: String(takeProfitPrice),
                  stopPrice: String(stopLossPrice),
                  stopLimitPrice: String(stopLossPrice),
                  quantity: String(quantity),
                  recvWindow: 60000,
                })
                .catch(error);
            } else {
              if (takeProfitPrice) {
                // Sell limit order as TP
                this.binanceClient
                  .order({
                    side: 'SELL',
                    type: 'LIMIT',
                    symbol: pair,
                    price: String(takeProfitPrice),
                    quantity: String(quantity),
                    recvWindow: 60000,
                  })
                  .catch(error);
              }
              if (stopLossPrice) {
                // Sell limit order as SL
                this.binanceClient
                  .order({
                    side: 'SELL',
                    type: 'LIMIT',
                    symbol: pair,
                    price: String(stopLossPrice),
                    quantity: String(quantity),
                    recvWindow: 60000,
                  })
                  .catch(error);
              }
            }
          })
          .then(() => {
            log(
              `@spot > Buys ${asset} with ${base} at the price ${currentPrice}. TP/SL: ${
                takeProfitPrice ? takeProfitPrice : '----'
              }/${stopLossPrice ? stopLossPrice : '----'}`
            );
          })
          .catch(error);
      }
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
      allowPyramiding,
      maxPyramidingAllocation,
      unidirectional,
    } = tradeConfig;
    const pair = `${asset}${base}`;

    const useLongPosition = checkTrend ? checkTrend(candles) : true;
    const useShortPosition = checkTrend ? !useLongPosition : true;

    // Ge the available balance of base asset
    const balances = await this.binanceClient.futuresAccountBalance();
    const { balance, availableBalance } = balances.find(
      (balance) => balance.asset === base
    );

    const { positions } = this.accountInfo as FuturesAccountInfoResult;
    const position = positions.find((position) => position.symbol === pair);
    const hasLongPosition = Number(position.positionAmt) > 0;
    const hasShortPosition = Number(position.positionAmt) < 0;
    const canAddToPosition = allowPyramiding
      ? Number(position.initialMargin) + Number(balance) * allocation <=
        Number(balance) * maxPyramidingAllocation
      : false;
    const canTakeLongPosition =
      (!allowPyramiding && !hasLongPosition) || allowPyramiding;
    const canTakeShortPosition =
      (!allowPyramiding && !hasShortPosition) || allowPyramiding;

    const currentPrice = candles[candles.length - 1].close;
    const pricePrecision = getPricePrecision(pair, this.exchangeInfo);

    // Prevent remaining open orders when a stop profit or a stop loss has been activated
    if (
      !hasLongPosition &&
      !hasShortPosition &&
      getOpenOrders(pair).length > 0
    ) {
      this.closeOpenOrders(pair);
    }

    if (canTakeLongPosition && isBuySignal(candles, buyStrategy)) {
      // Take the profit and not open a new position
      if (hasShortPosition && unidirectional) {
        this.binanceClient
          .futuresOrder({
            side: 'BUY',
            type: 'MARKET',
            symbol: pair,
            quantity: position.positionAmt,
            recvWindow: 60000,
          })
          .then(() => {
            this.closeOpenOrders(pair);
            log(
              `@futures > Closes the short position for ${pair}. PNL: ${position.unrealizedProfit}`
            );
          });
        return;
      }

      // Do not trade with long position if the strategy is disabled
      if (!useLongPosition) return;

      // Do not add to the current position if the allocation is over the max allocation
      if (allowPyramiding && hasLongPosition && !canAddToPosition) return;

      const { takeProfitPrice, stopLossPrice } = tpslStrategy
        ? tpslStrategy({
            candles,
            tradeConfig,
            pricePrecision,
            side: 'BUY',
          })
        : { takeProfitPrice: null, stopLossPrice: null };

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
          side: 'BUY',
          type: 'MARKET',
          symbol: pair,
          quantity: String(quantity),
          recvWindow: 60000,
        })
        .then(() => {
          if (hasShortPosition) {
            this.closeOpenOrders(pair);
            log(
              `@futures > Closes the short position for ${pair}. PNL: ${position.unrealizedProfit}`
            );
          }

          if (takeProfitPrice) {
            // Take profit order
            this.binanceClient
              .futuresOrder({
                side: 'SELL',
                type: 'TAKE_PROFIT_MARKET',
                symbol: pair,
                stopPrice: String(takeProfitPrice),
                quantity: String(quantity),
                recvWindow: 60000,
              })
              .then((order) => {
                addOpenOrder(
                  pair,
                  order.orderId,
                  order.side,
                  order.type,
                  Number(order.stopPrice)
                );
              })
              .catch(error);
          }

          if (stopLossPrice) {
            // Stop loss order
            this.binanceClient
              .futuresOrder({
                side: 'SELL',
                type: 'STOP_MARKET',
                symbol: pair,
                stopPrice: String(stopLossPrice),
                quantity: String(quantity),
                recvWindow: 60000,
              })
              .then((order) => {
                addOpenOrder(
                  pair,
                  order.orderId,
                  order.side,
                  order.type,
                  Number(order.stopPrice)
                );
              })
              .catch(error);
          }
        })
        .then(() => {
          log(
            `@futures > Takes a long position for ${pair} at the price ${currentPrice} with TP/SL: ${
              takeProfitPrice ? takeProfitPrice : '----'
            }/${stopLossPrice ? stopLossPrice : '----'}`
          );
        })
        .catch(error);
    } else if (canTakeShortPosition && isSellSignal(candles, sellStrategy)) {
      // Take the profit and not open a new position
      if (hasLongPosition && unidirectional) {
        this.binanceClient
          .futuresOrder({
            side: 'SELL',
            type: 'MARKET',
            symbol: pair,
            quantity: position.positionAmt,
            recvWindow: 60000,
          })
          .then(() => {
            this.closeOpenOrders(pair);
            log(
              `@futures > Closes the long position for ${pair}. PNL: ${position.unrealizedProfit}`
            );
          });
        return;
      }

      // Do not trade with short position if the strategy is disabled
      if (!useShortPosition) return;

      // Do not add to the current position if the allocation is over the max allocation
      if (allowPyramiding && hasShortPosition && !canAddToPosition) return;

      const { takeProfitPrice, stopLossPrice } = tpslStrategy
        ? tpslStrategy({
            candles,
            tradeConfig,
            pricePrecision,
            side: 'SELL',
          })
        : { takeProfitPrice: null, stopLossPrice: null };

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
          side: 'SELL',
          type: 'MARKET',
          symbol: pair,
          quantity: String(quantity),
          recvWindow: 60000,
        })
        .then(() => {
          if (hasLongPosition) {
            this.closeOpenOrders(pair);
            log(
              `@futures > Closes the long position for ${pair}. PNL: ${position.unrealizedProfit}`
            );
          }

          if (takeProfitPrice) {
            // Take profit order
            this.binanceClient
              .futuresOrder({
                side: 'BUY',
                type: 'TAKE_PROFIT_MARKET',
                symbol: pair,
                stopPrice: String(takeProfitPrice),
                quantity: String(quantity),
                recvWindow: 60000,
              })
              .then((order) => {
                addOpenOrder(
                  pair,
                  order.orderId,
                  order.side,
                  order.type,
                  Number(order.stopPrice)
                );
              })
              .catch(error);
          }

          if (stopLossPrice) {
            // Stop loss order
            this.binanceClient
              .futuresOrder({
                side: 'BUY',
                type: 'STOP_MARKET',
                symbol: pair,
                stopPrice: String(stopLossPrice),
                quantity: String(quantity),
                recvWindow: 60000,
              })
              .then((order) => {
                addOpenOrder(
                  pair,
                  order.orderId,
                  order.side,
                  order.type,
                  Number(order.stopPrice)
                );
              })
              .catch(error);
          }
        })
        .then(() => {
          log(
            `@futures > Bot takes a short for ${pair} at the price ${currentPrice} with TP/SL: ${
              takeProfitPrice ? takeProfitPrice : '----'
            }/${stopLossPrice ? stopLossPrice : '----'}`
          );
        })
        .catch(error);
    }
  }

  /**
   * Load candles and add them to the history
   */
  private loadCandles(
    symbol: string,
    interval: CandleChartInterval,
    onlyFinalCandle = true
  ) {
    return new Promise<ChartCandle[]>((resolve, reject) => {
      const getCandles =
        BINANCE_MODE === 'spot'
          ? this.binanceClient.candles
          : this.binanceClient.futuresCandles;

      getCandles({ symbol, interval })
        .then((candles) => {
          log(
            `@${BINANCE_MODE} > Load successfully the candles for the pair ${symbol}`
          );
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
    const orders = getOpenOrders(symbol);
    if (orders) {
      orders.forEach(({ id }) => {
        const cancel =
          BINANCE_MODE === 'spot'
            ? this.binanceClient.cancelOrder
            : this.binanceClient.futuresCancelOrder;

        cancel({ symbol, orderId: id }).catch(error);
      });
      deleteOpenOrders(symbol);
      log(
        `@${BINANCE_MODE} > Close all the open orders for the pair ${symbol}`
      );
    }
  }

  private checkOpenOrders(symbol: string, realtimePrice: number) {
    const orders = getOpenOrders(symbol);
    if (orders) {
      orders.forEach(({ id, side, type, stopPrice }) => {
        if (side === 'BUY' && realtimePrice <= stopPrice) {
          if (type === 'TAKE_PROFIT_MARKET' || type === 'STOP_MARKET') {
            deleteOpenOrder(symbol, id);
          }
        } else if (side === 'SELL' && realtimePrice >= stopPrice) {
          if (type === 'TAKE_PROFIT_MARKET' || type === 'STOP_MARKET') {
            deleteOpenOrder(symbol, id);
          }
        }
      });
    }
  }
}
