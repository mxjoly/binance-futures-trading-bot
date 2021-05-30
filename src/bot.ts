import Binance, {
  Candle,
  CandleChartInterval,
  ExchangeInfo,
} from 'binance-api-node';
import {
  tradeConfigs,
  BINANCE_MODE,
  MAX_CANDLES_HISTORY,
  FUTURES_STRATEGY,
} from './config';
import {
  calculateAllocationQuantity,
  decimalCeil,
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

const historyCandles: { [pair: string]: ChartCandle[] } = {};

// All open orders in futures
const openOrders: { [pair: string]: number[] } = {};

// ====================================================================== //

export function prepare() {
  // Initialize history and open orders
  tradeConfigs.forEach((tradeConfig) => {
    const pair = tradeConfig.asset + tradeConfig.base;
    historyCandles[pair] = [];
    openOrders[pair] = [];
  });

  if (BINANCE_MODE === 'futures') {
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
      .then(() => {
        log(`@${BINANCE_MODE} > The bot trades the pair ${pair}`);

        const getCandles =
          BINANCE_MODE === 'spot'
            ? binanceClient.ws.candles
            : // @ts-ignore
              binanceClient.ws.futuresCandles;

        getCandles(pair, tradeConfig.interval, (candle: Candle) => {
          // Add only the closed candles
          if (candle.isFinal) {
            historyCandles[pair].push(ChartCandle(candle));
            historyCandles[pair] = historyCandles[pair].slice(1);

            if (BINANCE_MODE === 'spot') {
              tradeWithSpot(
                tradeConfig,
                historyCandles[pair],
                Number(candle.close),
                exchangeInfo
              );
            } else {
              tradeWithFutures(
                tradeConfig,
                historyCandles[pair],
                Number(candle.close),
                exchangeInfo
              );
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
  return new Promise((resolve, reject) => {
    const getCandles =
      BINANCE_MODE === 'spot'
        ? binanceClient.candles
        : binanceClient.futuresCandles;

    getCandles({ symbol, interval })
      .then((candles) => {
        historyCandles[symbol] = candles
          .slice(MAX_CANDLES_HISTORY, -1) // The last candles are not closed yet
          .map((candle) => ChartCandle(candle));
      })
      .then(() => {
        log(
          `@${BINANCE_MODE} > The candles for the pair ${symbol} are successfully loaded`
        );
      })
      .then(resolve)
      .catch(reject);
  });
}

async function tradeWithSpot(
  tradeConfig: TradeConfig,
  candles: ChartCandle[],
  realtimePrice: number,
  exchangeInfo: ExchangeInfo
) {
  const { asset, base, allocation, profitTarget, lossTolerance } = tradeConfig;
  const pair = `${asset}${base}`;

  // Ge the available balance of base asset
  const { balances } = await binanceClient.accountInfo();
  const availableBalance = Number(
    balances.find((balance) => balance.asset === base).free
  );

  const pricePrecision = getPricePrecision(pair, exchangeInfo);

  const currentTrades = await binanceClient.myTrades({ symbol: pair });

  // If a trade exists, search when to sell
  if (currentTrades.length > 0) {
    const openTrade = currentTrades[0];

    if (isSellSignal(candles)) {
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
              realtimePrice * Number(openTrade.qty) -
              Number(openTrade.price) * Number(openTrade.qty)
            }`
          );
        })
        .catch(error);
    }
  } else {
    if (isBuySignal(candles)) {
      const takeProfitPrice = profitTarget
        ? decimalCeil(realtimePrice * (1 + profitTarget), pricePrecision)
        : null;
      const stopLossPrice = decimalCeil(
        realtimePrice * (1 - lossTolerance),
        pricePrecision
      );

      const quantity = await calculateAllocationQuantity(
        asset,
        base,
        availableBalance,
        allocation,
        realtimePrice,
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
            `@spot > Buys ${asset} with ${base} at the price ${realtimePrice}. TP/SL: ${
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
  realtimePrice: number,
  exchangeInfo: ExchangeInfo
) {
  const { asset, base, lossTolerance, profitTarget, allocation } = tradeConfig;
  const pair = `${asset}${base}`;

  // Ge the available balance of base asset
  const balances = await binanceClient.futuresAccountBalance();
  const availableBalance = Number(
    balances.find((balance) => balance.asset === base).availableBalance
  );

  const { positions } = await binanceClient.futuresAccountInfo();
  const position = positions.find((position) => position.symbol === pair);
  const hasLongPosition = Number(position.positionAmt) > 0;
  const hasShortPosition = Number(position.positionAmt) < 0;

  const pricePrecision = getPricePrecision(pair, exchangeInfo);

  // Prevent remaining open orders when a stop profit or a stop loss is activated
  if (!hasLongPosition && !hasShortPosition && openOrders[pair].length > 0) {
    closeOpenOrders(pair);
  }

  if (!hasLongPosition && isBuySignal(candles)) {
    // If long position are not enabled, just close the short position and wait for a sell signal
    if (hasShortPosition && FUTURES_STRATEGY.long === false) {
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
    if (FUTURES_STRATEGY.long === false) return;

    const takeProfitPrice = profitTarget
      ? decimalCeil(realtimePrice * (1 + profitTarget), pricePrecision)
      : null;
    const stopLossPrice = decimalCeil(
      realtimePrice * (1 - lossTolerance),
      pricePrecision
    );

    let quantity = await calculateAllocationQuantity(
      asset,
      base,
      availableBalance,
      allocation * (tradeConfig.leverage || 1),
      realtimePrice,
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
      })
      .then(() => {
        log(
          `@futures > Takes a long position for ${pair} at the price ${realtimePrice} with TP/SL: ${
            takeProfitPrice ? takeProfitPrice : '----'
          }/${stopLossPrice}`
        );
      })
      .catch(error);
  } else if (!hasShortPosition && isSellSignal(candles)) {
    // If short position are not enabled, just close the long position and wait for a buy signal
    if (hasLongPosition && FUTURES_STRATEGY.short === false) {
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
    if (FUTURES_STRATEGY.short === false) return;

    const takeProfitPrice = profitTarget
      ? decimalCeil(realtimePrice * (1 - profitTarget), pricePrecision)
      : null;
    const stopLossPrice = decimalCeil(
      realtimePrice * (1 + lossTolerance),
      pricePrecision
    );

    let quantity = await calculateAllocationQuantity(
      asset,
      base,
      availableBalance,
      allocation * (tradeConfig.leverage || 1),
      realtimePrice,
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
      })
      .then(() => {
        log(
          `@futures > Bot takes a short for ${pair} at the price ${realtimePrice} with TP/SL: ${
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
