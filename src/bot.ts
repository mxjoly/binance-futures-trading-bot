import winston from 'winston';
import Binance, {
  Candle,
  CandleChartInterval,
  CandleChartResult,
  ExchangeInfo,
} from 'binance-api-node';
import dateFormat from 'dateformat';
import technicalIndicators from 'technicalindicators';
import { RSI, CROSS_SMA, SMA, RSI_SMA } from './indicators';
import {
  tradeConfigs,
  BINANCE_MODE,
  MAX_CANDLES_HISTORY,
  FUTURES_STRATEGY,
} from './config';

require('dotenv').config();

// ====================================================================== //

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.simple(),
  transports: [new winston.transports.File({ filename: 'bot.log' })],
});

const binanceClient = Binance({
  apiKey: process.env.BINANCE_PUBLIC_KEY,
  apiSecret: process.env.BINANCE_PRIVATE_KEY,
});

const historyCandles: { [pair: string]: ChartCandle[] } = {};

// All open orders in futures
const openOrders: { [pair: string]: number[] } = {};

// ====================================================================== //

function prepare() {
  // Initialize history and open orders
  tradeConfigs.forEach((tradeConfig) => {
    const pair = tradeConfig.asset + tradeConfig.base;
    historyCandles[pair] = [];
    openOrders[pair] = [];
  });

  if (BINANCE_MODE === 'futures') {
    // Set the margin type and initial leverage for the futures
    tradeConfigs.forEach((tradeConfig) => {
      binanceClient
        .futuresMarginType({
          symbol: tradeConfig.asset + tradeConfig.base,
          marginType: 'ISOLATED',
        })
        .catch(error);

      binanceClient
        .futuresLeverage({
          symbol: tradeConfig.asset + tradeConfig.base,
          leverage: tradeConfig.leverage || 2,
        })
        .catch(error);
    });
  }
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
          .slice(-(MAX_CANDLES_HISTORY + 1), -1) // The last candles are not closed yet
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

async function run() {
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
            `@spot > Sells ${openTrade.symbol} to ${base}. Gain: ${
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
      allocation,
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
      allocation,
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

function ChartCandle(candle: Candle | CandleChartResult): ChartCandle {
  return {
    open: Number(candle.open),
    high: Number(candle.high),
    low: Number(candle.low),
    close: Number(candle.close),
    volume: Number(candle.volume),
    closeTime: Number(candle.closeTime),
    trades: Number(candle.trades),
  };
}

function isBuySignal(candles: ChartCandle[]) {
  const data = {
    open: candles.map((candle) => candle.open),
    high: candles.map((candle) => candle.high),
    close: candles.map((candle) => candle.close),
    low: candles.map((candle) => candle.low),
  };
  return (
    // technicalIndicators.bullish(data) ||
    // CROSS_SMA.isBuySignal(candles) ||
    // RSI.isBuySignal(candles) ||
    SMA.isBuySignal(candles)
  );
}

function isSellSignal(candles: ChartCandle[]) {
  const data = {
    open: candles.map((candle) => candle.open),
    high: candles.map((candle) => candle.high),
    close: candles.map((candle) => candle.close),
    low: candles.map((candle) => candle.low),
  };
  return (
    // technicalIndicators.bearish(data) ||
    // CROSS_SMA.isSellSignal(candles) ||
    // RSI.isSellSignal(candles) ||
    SMA.isSellSignal(candles)
  );
}

/**
 * @see https://github.com/binance/binance-spot-api-docs/blob/master/rest-api.md#lot_size
 */
function isValidQuantity(
  quantity: number,
  pair: string,
  exchangeInfo: ExchangeInfo
) {
  const rules = getLotSizeQuantityRules(pair, exchangeInfo);
  return quantity >= rules.minQty && quantity <= rules.maxQty;
}

/**
 * Get the minimal quantity to trade with this pair according to the
 * Binance futures trading rules
 */
function getMinOrderQuantity(
  asset: string,
  usdtPrice: number,
  exchangeInfo: ExchangeInfo
) {
  const precision = getQuantityPrecision(`${asset}USDT`, exchangeInfo);
  const minimumNotionalValue = 5; // threshold in USDT
  return decimalCeil(minimumNotionalValue / usdtPrice, precision);
}

/**
 * Get the quantity rules to make a valid order
 * @see https://github.com/binance/binance-spot-api-docs/blob/master/rest-api.md#lot_size
 * @see https://www.binance.com/en/support/faq/360033161972
 */
function getLotSizeQuantityRules(pair: string, exchangeInfo: ExchangeInfo) {
  // @ts-ignore
  const { minQty, maxQty, stepSize } = exchangeInfo.symbols
    .find((symbol) => symbol.symbol === pair)
    // @ts-ignore
    .filters.find((filter) => filter.filterType === 'LOT_SIZE');

  return {
    minQty: Number(minQty),
    maxQty: Number(maxQty),
    stepSize: Number(stepSize),
  };
}

/**
 * Calculate the quantity of crypto to buy according to your available balance,
 * the allocation you want, and the current price of the crypto
 * @param asset
 * @param base
 * @param availableBalance - Your available balance in your wallet
 * @param allocation - The allocation to take from your wallet total balance
 * @param realtimePrice - The current price of the crypto to buy
 * @param exchangeInfo
 */
async function calculateAllocationQuantity(
  asset: string,
  base: string,
  availableBalance: number,
  allocation: number,
  realtimePrice: number,
  exchangeInfo: ExchangeInfo
) {
  const pair = asset + base;
  const quantityPrecision = getQuantityPrecision(pair, exchangeInfo);
  const allocationQuantity = (availableBalance * allocation) / realtimePrice;

  const minQuantity =
    BINANCE_MODE === 'spot'
      ? getLotSizeQuantityRules(pair, exchangeInfo).minQty
      : getMinOrderQuantity(asset, realtimePrice, exchangeInfo);

  return allocationQuantity > minQuantity
    ? decimalCeil(allocationQuantity, quantityPrecision)
    : minQuantity;
}

/**
 * Get the maximal number of decimals for a pair quantity
 */
function getQuantityPrecision(pair: string, exchangeInfo: ExchangeInfo) {
  const symbol = exchangeInfo.symbols.find((symbol) => symbol.symbol === pair);
  // @ts-ignore
  return symbol.quantityPrecision as number;
}

/**
 * Get the maximal number of decimals for a pair quantity
 */
function getPricePrecision(pair: string, exchangeInfo: ExchangeInfo) {
  const symbol = exchangeInfo.symbols.find((symbol) => symbol.symbol === pair);
  // @ts-ignore
  return symbol.pricePrecision as number;
}

/**
 * Math.ceil with decimals
 * @param a
 * @param precision - The number of decimals after the comma
 */
function decimalCeil(x: number, precision: number) {
  return Math.ceil(x * Math.pow(10, precision)) / Math.pow(10, precision);
}

function log(message: string) {
  logger.info(`${dateFormat()} : ${message}`);
  console.log(`${dateFormat()} : ${message}`);
}

function error(message: string) {
  logger.warn(`${dateFormat()} : ${message}`);
  console.error(`${dateFormat()} : ${message}`);
}

prepare();
run();
