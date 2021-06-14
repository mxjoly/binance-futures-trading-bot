import Binance, {
  Candle,
  CandleChartInterval,
  ExchangeInfo,
} from 'binance-api-node';
import { EMA } from 'technicalindicators';
import { tradeConfigs, BINANCE_MODE, FUTURES_USE_TREND_LINE } from './config';
import { isBullEngulfing } from './patterns/engulfing';
import {
  calculateAllocationQuantity,
  getPricePrecision,
  isBuySignal,
  isSellSignal,
  isValidQuantity,
  ChartCandle,
  error,
  log,
} from './utils';

require('dotenv').config();

// ====================================================================== //

const binanceClient = Binance({
  apiKey: process.env.BINANCE_PUBLIC_KEY,
  apiSecret: process.env.BINANCE_PRIVATE_KEY,
});

// All open orders in futures
const openOrders: { [pair: string]: number[] } = {};

// ====================================================================== //

export function prepare() {
  if (BINANCE_MODE === 'futures') {
    // Initialize the arrays of open orders
    tradeConfigs.forEach((tradeConfig) => {
      const pair = tradeConfig.asset + tradeConfig.base;
      openOrders[pair] = [];
    });

    // Set the margin type and initial leverage for the futures
    tradeConfigs.forEach((tradeConfig) => {
      const pair = tradeConfig.asset + tradeConfig.base;

      binanceClient
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

      binanceClient
        .futuresMarginType({
          symbol: pair,
          marginType: 'ISOLATED',
        })
        .catch(error);
    });
  }
}

export async function run() {
  log(
    '====================== 💵 BINANCE BOT TRADING 💵 ======================'
  );

  const exchangeInfo =
    BINANCE_MODE === 'spot'
      ? await binanceClient.exchangeInfo()
      : await binanceClient.futuresExchangeInfo();

  tradeConfigs.forEach((tradeConfig) => {
    const pair = tradeConfig.asset + tradeConfig.base;

    loadCandles(pair, tradeConfig.interval)
      .then((candles) => {
        log(`@${BINANCE_MODE} > The bot trades the pair ${pair}`);

        const getCandles =
          BINANCE_MODE === 'spot'
            ? binanceClient.ws.candles
            : // @ts-ignore
              binanceClient.ws.futuresCandles;

        getCandles(pair, tradeConfig.interval, (candle: Candle) => {
          // Add only the closed candles
          if (candle.isFinal) {
            candles.push(ChartCandle(candle));
            candles = candles.slice(1);

            if (BINANCE_MODE === 'spot') {
              tradeWithSpot(tradeConfig, candles, exchangeInfo);
            } else {
              tradeWithFutures(tradeConfig, candles, exchangeInfo);
            }
          }
        });
      })
      .catch(error);
  });
}

/**
 * Load candles and add them to the history
 */
function loadCandles(symbol: string, interval: CandleChartInterval) {
  return new Promise<ChartCandle[]>((resolve, reject) => {
    const getCandles =
      BINANCE_MODE === 'spot'
        ? binanceClient.candles
        : binanceClient.futuresCandles;

    getCandles({ symbol, interval })
      .then((candles) => {
        log(
          `@${BINANCE_MODE} > The candles for the pair ${symbol} are successfully loaded`
        );
        resolve(
          candles
            .slice(0, -1) // The last candles are not closed yet
            .map((candle) => ChartCandle(candle))
        );
      })
      .catch(reject);
  });
}

async function tradeWithSpot(
  tradeConfig: TradeConfig,
  candles: ChartCandle[],
  exchangeInfo: ExchangeInfo
) {
  const { asset, base, allocation, buyStrategy, sellStrategy, tpslStrategy } =
    tradeConfig;
  const pair = `${asset}${base}`;

  // Ge the available balance of base asset
  const { balances } = await binanceClient.accountInfo();
  const availableBalance = Number(
    balances.find((balance) => balance.asset === base).free
  );

  const pricePrecision = getPricePrecision(pair, exchangeInfo);
  const currentPrice = candles[candles.length - 1].close;
  const currentTrades = await binanceClient.myTrades({ symbol: pair });

  // If a trade exists, search when to sell
  if (currentTrades.length > 0) {
    const openTrade = currentTrades[0];

    if (isSellSignal(candles, sellStrategy)) {
      binanceClient
        .order({
          side: 'SELL',
          type: 'MARKET',
          symbol: openTrade.symbol,
          quantity: openTrade.qty,
          recvWindow: 60000,
        })
        .then(() => {
          log(
            `@spot > Sells ${asset} to ${base}. Gain: ${
              currentPrice * Number(openTrade.qty) -
              Number(openTrade.price) * Number(openTrade.qty)
            }`
          );
        })
        .catch(error);
    }
  } else {
    if (isBuySignal(candles, buyStrategy)) {
      const { takeProfitPrice, stopLossPrice } = tpslStrategy({
        candles,
        tradeConfig,
        pricePrecision,
        side: 'BUY',
      });

      const quantity = await calculateAllocationQuantity(
        asset,
        base,
        availableBalance,
        allocation,
        currentPrice,
        exchangeInfo
      );

      // Buy limit order
      binanceClient
        .order({
          side: 'BUY',
          type: 'MARKET',
          symbol: pair,
          quantity: String(quantity),
          recvWindow: 60000,
        })
        .then(() => {
          if (takeProfitPrice) {
            // Sell oco order as TP/SL
            binanceClient
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
            // Sell limit order as SL
            binanceClient
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
        })
        .then(() => {
          log(
            `@spot > Buys ${asset} with ${base} at the price ${currentPrice}. TP/SL: ${
              takeProfitPrice ? takeProfitPrice : '----'
            }/${stopLossPrice}`
          );
        })
        .catch(error);
    }
  }
}

async function tradeWithFutures(
  tradeConfig: TradeConfig,
  candles: ChartCandle[],
  exchangeInfo: ExchangeInfo
) {
  const { asset, base, allocation, buyStrategy, sellStrategy, tpslStrategy } =
    tradeConfig;
  const pair = `${asset}${base}`;

  let useLongPosition = FUTURES_USE_TREND_LINE
    ? isOverTrendLine(candles)
    : true;
  let useShortPosition = FUTURES_USE_TREND_LINE
    ? !isOverTrendLine(candles)
    : true;

  // Ge the available balance of base asset
  const balances = await binanceClient.futuresAccountBalance();
  const availableBalance = Number(
    balances.find((balance) => balance.asset === base).availableBalance
  );

  const { positions } = await binanceClient.futuresAccountInfo();
  const position = positions.find((position) => position.symbol === pair);
  const hasLongPosition = Number(position.positionAmt) > 0;
  const hasShortPosition = Number(position.positionAmt) < 0;

  const currentPrice = candles[candles.length - 1].close;
  const pricePrecision = getPricePrecision(pair, exchangeInfo);

  // Prevent remaining open orders when a stop profit or a stop loss is activated
  if (!hasLongPosition && !hasShortPosition && openOrders[pair].length > 0) {
    closeOpenOrders(pair);
  }

  if (!hasLongPosition && isBuySignal(candles, buyStrategy)) {
    // If long position are not enabled, just close the short position and wait for a sell signal
    if (hasShortPosition && useLongPosition === false) {
      binanceClient
        .futuresOrder({
          side: 'BUY',
          type: 'MARKET',
          symbol: pair,
          quantity: position.positionAmt,
          recvWindow: 60000,
        })
        .then(() => {
          closeOpenOrders(pair);
          log(
            `@futures > Closes the short position for ${pair}. PNL: ${position.unrealizedProfit}`
          );
        });
      return;
    }

    // Do not trade with long position if the strategy is disabled
    if (useLongPosition === false) return;

    const { takeProfitPrice, stopLossPrice } = tpslStrategy({
      candles,
      tradeConfig,
      pricePrecision,
      side: 'BUY',
    });

    let quantity = await calculateAllocationQuantity(
      asset,
      base,
      availableBalance,
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
        side: 'BUY',
        type: 'MARKET',
        symbol: pair,
        quantity: String(quantity),
        recvWindow: 60000,
      })
      .then(() => {
        if (hasShortPosition) {
          closeOpenOrders(pair);
          log(
            `@futures > Closes the short position for ${pair}. PNL: ${position.unrealizedProfit}`
          );
        }

        if (takeProfitPrice) {
          // Take profit order
          binanceClient
            .futuresOrder({
              side: 'SELL',
              type: 'TAKE_PROFIT_MARKET',
              symbol: pair,
              stopPrice: String(takeProfitPrice),
              quantity: String(quantity),
              recvWindow: 60000,
            })
            .then((order) => {
              openOrders[pair].push(order.orderId);
            })
            .catch(error);
        }

        if (stopLossPrice) {
          // Stop loss order
          binanceClient
            .futuresOrder({
              side: 'SELL',
              type: 'STOP_MARKET',
              symbol: pair,
              stopPrice: String(stopLossPrice),
              quantity: String(quantity),
              recvWindow: 60000,
            })
            .then((order) => {
              openOrders[pair].push(order.orderId);
            })
            .catch(error);
        }
      })
      .then(() => {
        log(
          `@futures > Takes a long position for ${pair} at the price ${currentPrice} with TP/SL: ${
            takeProfitPrice ? takeProfitPrice : '----'
          }/${stopLossPrice}`
        );
      })
      .catch(error);
  } else if (!hasShortPosition && isSellSignal(candles, sellStrategy)) {
    // If short position are not enabled, just close the long position and wait for a buy signal
    if (hasLongPosition && useShortPosition === false) {
      binanceClient
        .futuresOrder({
          side: 'SELL',
          type: 'MARKET',
          symbol: pair,
          quantity: position.positionAmt,
          recvWindow: 60000,
        })
        .then(() => {
          closeOpenOrders(pair);
          log(
            `@futures > Closes the long position for ${pair}. PNL: ${position.unrealizedProfit}`
          );
        });
      return;
    }

    // Do not trade with short position if the strategy is disabled
    if (useShortPosition === false) return;

    const { takeProfitPrice, stopLossPrice } = tpslStrategy({
      candles,
      tradeConfig,
      pricePrecision,
      side: 'SELL',
    });

    let quantity = await calculateAllocationQuantity(
      asset,
      base,
      availableBalance,
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
        side: 'SELL',
        type: 'MARKET',
        symbol: pair,
        quantity: String(quantity),
        recvWindow: 60000,
      })
      .then(() => {
        if (hasLongPosition) {
          closeOpenOrders(pair);
          log(
            `@futures > Closes the long position for ${pair}. PNL: ${position.unrealizedProfit}`
          );
        }

        if (takeProfitPrice) {
          // Take profit order
          binanceClient
            .futuresOrder({
              side: 'BUY',
              type: 'TAKE_PROFIT_MARKET',
              symbol: pair,
              stopPrice: String(takeProfitPrice),
              quantity: String(quantity),
              recvWindow: 60000,
            })
            .then((order) => {
              openOrders[pair].push(order.orderId);
            })
            .catch(error);
        }

        if (stopLossPrice) {
          // Stop loss order
          binanceClient
            .futuresOrder({
              side: 'BUY',
              type: 'STOP_MARKET',
              symbol: pair,
              stopPrice: String(stopLossPrice),
              quantity: String(quantity),
              recvWindow: 60000,
            })
            .then((order) => {
              openOrders[pair].push(order.orderId);
            })
            .catch(error);
        }
      })
      .then(() => {
        log(
          `@futures > Bot takes a short for ${pair} at the price ${currentPrice} with TP/SL: ${
            takeProfitPrice ? takeProfitPrice : '----'
          }/${stopLossPrice}`
        );
      })
      .catch(error);
  }
}

function closeOpenOrders(symbol: string) {
  openOrders[symbol].forEach((order) => {
    const cancel =
      BINANCE_MODE === 'spot'
        ? binanceClient.cancelOrder
        : binanceClient.futuresCancelOrder;

    cancel({ symbol, orderId: order }).catch(error);
  });
  openOrders[symbol] = []; // reset the list of order id
  log(`@${BINANCE_MODE} > Close all the open orders for the pair ${symbol}`);
}

/**
 * Return true if the trend line is up
 */
function isOverTrendLine(candles: ChartCandle[]) {
  const ema = EMA.calculate({
    values: candles.map((candle) => candle.close),
    period: 200,
  });
  return candles[candles.length - 1].close > ema[ema.length - 1];
}
