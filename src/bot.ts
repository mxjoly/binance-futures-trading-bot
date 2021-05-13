import winston from 'winston';
import Binance, { Candle, ExchangeInfo, TradeResult } from 'binance-api-node';
import technicalIndicators from 'technicalindicators';
import { RSI, CROSS_SMA, SMA, RSI_SMA } from './indicators';
import {
  tradeConfigs,
  MAX_SAVED_CANDLES,
  MIN_FREE_BALANCE_FOR_FUTURE_TRADING,
  MIN_FREE_BALANCE_FOR_SPOT_TRADING,
} from './config';
require('dotenv').config();

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.simple(),
  defaultMeta: { date: new Date(Date.now()) },
  transports: [new winston.transports.File({ filename: 'bot.log' })],
});

const binanceClient = Binance({
  apiKey: process.env.BINANCE_PUBLIC_KEY,
  apiSecret: process.env.BINANCE_PRIVATE_KEY,
  getTime: () => Date.now(),
});

const closeCandles: { [key: string]: Candle[] } = {};

// ====================================================================== //

const BINANCE_MODE: BinanceMode = 'futures';

// ====================================================================== //

function prepare() {
  // Initialize array of closes candles
  tradeConfigs
    .map((tradeConfig) => tradeConfig.asset + tradeConfig.base)
    .forEach((pair) => {
      closeCandles[pair] = [];
    });

  if (BINANCE_MODE === 'futures') {
    // Set the initial leverage for the futures
    tradeConfigs.forEach((tradeConfig) => {
      binanceClient
        .futuresLeverage({
          symbol: tradeConfig.asset + tradeConfig.base,
          leverage: tradeConfig.leverage || 2,
        })
        .catch(error);
    });
  }
}

async function run() {
  let loadDataComplete = false;

  log('====================== Binance Bot Trading ======================');

  const exchangeInfo =
    BINANCE_MODE === 'spot'
      ? await binanceClient.exchangeInfo()
      : await binanceClient.futuresExchangeInfo();

  tradeConfigs.forEach((tradeConfig) => {
    const pair = tradeConfig.asset + tradeConfig.base;

    log(
      `@${BINANCE_MODE} > The bot prepares to check the pair ${tradeConfig.asset}/${tradeConfig.base}`
    );

    binanceClient.ws.candles(pair, tradeConfig.interval, (candle) => {
      const candles = closeCandles[pair];

      if (candles.length > MAX_SAVED_CANDLES) candles.slice(1);

      // Add only the closed candle
      if (candle.isFinal) {
        candles.push(candle);
        // No trade before filling the candles array
        if (!loadDataComplete) {
          if (candles.length < MAX_SAVED_CANDLES) {
            log(
              `@${BINANCE_MODE} > Waiting to have enough candles to trade ${pair}. Progress: ${Math.floor(
                (candles.length / MAX_SAVED_CANDLES) * 100
              )}%`
            );
          } else if (candles.length === MAX_SAVED_CANDLES) {
            log(
              `@${BINANCE_MODE} > Waiting to have enough candles to trade ${pair}. Progress: 100%`
            );
            log(`@${BINANCE_MODE} > The bot is ready to trade now !`);
            loadDataComplete = true;
          }
        }
      }

      if (candles.length < MAX_SAVED_CANDLES) return;

      if (BINANCE_MODE === 'spot') {
        tradeWithSpot(tradeConfig, candles, Number(candle.close), exchangeInfo);
      } else {
        tradeWithFutures(
          tradeConfig,
          candles,
          Number(candle.close),
          exchangeInfo
        );
      }
    });
  });
}

async function tradeWithSpot(
  tradeConfig: TradeConfig,
  candles: Candle[],
  realtimePrice: number,
  exchangeInfo: ExchangeInfo
) {
  const pair = `${tradeConfig.asset}${tradeConfig.base}`;

  const { balances } = await binanceClient.accountInfo();
  const availableBalance = Number(
    balances.find((balance) => balance.asset === tradeConfig.base).free
  );

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
        })
        .then(() => {
          log(
            `@Spot > Bot sold ${openTrade.symbol} to ${
              tradeConfig.base
            }. Gain: ${
              realtimePrice * Number(openTrade.qty) -
              Number(openTrade.price) * Number(openTrade.qty)
            }`
          );
        })
        .catch(error);
    }
  } else if (availableBalance >= MIN_FREE_BALANCE_FOR_SPOT_TRADING) {
    if (isBuySignal(candles)) {
      const takeProfitPrice = tradeConfig.profitTarget
        ? calculatePrice(realtimePrice, 1 + tradeConfig.profitTarget)
        : null;
      const stopLossPrice = calculatePrice(
        realtimePrice,
        1 - tradeConfig.lossTolerance
      );

      const quantity = getQuantity(
        pair,
        availableBalance,
        tradeConfig.allocation,
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
                quantity: '100',
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
                quantity: '100',
              })
              .catch(error);
          }
        })
        .then(() => {
          log(
            `@Spot > Bot bought ${tradeConfig.asset} with ${
              tradeConfig.base
            } at the price ${realtimePrice}. TP/SL: ${
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
  candles: Candle[],
  realtimePrice: number,
  exchangeInfo: ExchangeInfo
) {
  const pair = `${tradeConfig.asset}${tradeConfig.base}`;

  const balances = await binanceClient.futuresAccountBalance();
  const availableBalance = Number(
    balances.find((balance) => balance.asset === tradeConfig.base)
      .availableBalance
  );

  const currentTrades = await binanceClient.futuresTrades({ symbol: pair });

  function checkCurrentPosition(openTrade: TradeResult) {
    return new Promise<void>((resolve) => {
      if (isBuySignal(candles)) {
        binanceClient
          .futuresOrder({
            side: 'BUY',
            type: 'MARKET',
            symbol: pair,
            isIsolated: true,
            quantity: openTrade.qty,
          })
          .then(() => {
            log(
              `@Futures > Close the long position for ${pair}. PNL: ${
                (realtimePrice * Number(openTrade.qty) -
                  Number(openTrade.price) * Number(openTrade.qty)) *
                tradeConfig.leverage
              }`
            );
          })
          .then(resolve)
          .catch(error);
      } else if (isSellSignal(candles)) {
        binanceClient
          .futuresOrder({
            side: 'SELL',
            type: 'MARKET',
            symbol: pair,
            isIsolated: true,
            quantity: openTrade.qty,
          })
          .then(() => {
            log(
              `@Futures > Close the short position for ${pair}. PNL: ${
                (Number(openTrade.price) * Number(openTrade.qty) -
                  realtimePrice * Number(openTrade.qty)) *
                tradeConfig.leverage
              }`
            );
          })
          .then(resolve)
          .catch(error);
      } else {
        resolve();
      }
    });
  }

  function lookForPosition() {
    // Allow trading with a minimum of balance
    if (availableBalance >= MIN_FREE_BALANCE_FOR_FUTURE_TRADING) {
      if (isBuySignal(candles)) {
        const takeProfitPrice = tradeConfig.profitTarget
          ? calculatePrice(realtimePrice, 1 + tradeConfig.profitTarget)
          : null;
        const stopLossPrice = calculatePrice(
          realtimePrice,
          1 - tradeConfig.lossTolerance
        );

        const quantity = getQuantity(
          pair,
          availableBalance,
          tradeConfig.allocation,
          realtimePrice,
          exchangeInfo
        );

        // Buy limit order
        binanceClient
          .futuresOrder({
            side: 'BUY',
            type: 'MARKET',
            symbol: pair,
            isIsolated: true,
            quantity: String(quantity),
          })
          .then(() => {
            if (takeProfitPrice) {
              // Take profit order
              binanceClient.futuresOrder({
                side: 'SELL',
                type: 'TAKE_PROFIT_MARKET',
                symbol: pair,
                isIsolated: true,
                price: String(takeProfitPrice),
                quantity: String(quantity),
              });
            }

            // Stop loss order
            binanceClient.futuresOrder({
              side: 'SELL',
              type: 'STOP_MARKET',
              symbol: pair,
              isIsolated: true,
              stopPrice: String(stopLossPrice),
              quantity: String(quantity),
            });
          })
          .then(() => {
            log(
              `@Futures > Bot takes a long for ${pair} at the price ${realtimePrice} with TP/SL: ${
                takeProfitPrice ? takeProfitPrice : '----'
              }/${stopLossPrice}`
            );
          })
          .catch(error);
      } else if (isSellSignal(candles)) {
        const takeProfitPrice = tradeConfig.profitTarget
          ? calculatePrice(realtimePrice, 1 - tradeConfig.profitTarget)
          : null;
        const stopLossPrice = calculatePrice(
          realtimePrice,
          1 + tradeConfig.lossTolerance
        );

        const quantity = getQuantity(
          pair,
          availableBalance,
          tradeConfig.allocation,
          realtimePrice,
          exchangeInfo
        );

        // Sell limit order
        binanceClient
          .futuresOrder({
            side: 'SELL',
            type: 'MARKET',
            symbol: pair,
            isIsolated: true,
            quantity: String(quantity),
          })
          .then(() => {
            if (takeProfitPrice) {
              // Take profit order
              binanceClient.futuresOrder({
                side: 'BUY',
                type: 'TAKE_PROFIT_MARKET',
                symbol: pair,
                isIsolated: true,
                price: String(takeProfitPrice),
                quantity: String(quantity),
              });
            }

            // Stop loss order
            binanceClient.futuresOrder({
              side: 'BUY',
              type: 'STOP_MARKET',
              symbol: pair,
              isIsolated: true,
              stopPrice: String(stopLossPrice),
              quantity: String(quantity),
            });
          })
          .then(() => {
            log(
              `@Futures > Bot takes a short for ${pair} at the price ${realtimePrice} with TP/SL: ${
                takeProfitPrice ? takeProfitPrice : '----'
              }/${stopLossPrice}`
            );
          })
          .catch(error);
      }
    }
  }

  if (currentTrades.length > 0) {
    const openTrade = currentTrades[0];
    checkCurrentPosition(openTrade).then(lookForPosition);
  } else {
    lookForPosition();
  }
}

/**
 * Calculate a new price by apply a percentage
 */
function calculatePrice(price: number, percent: number) {
  const precision = getPrecision(price);
  const newPrice = price * percent;
  return precision ? Number(newPrice.toFixed(precision)) : newPrice;
}

function isBuySignal(candles: Candle[]) {
  const data = {
    open: candles.map((candle) => Number(candle.open)),
    high: candles.map((candle) => Number(candle.high)),
    close: candles.map((candle) => Number(candle.close)),
    low: candles.map((candle) => Number(candle.low)),
  };
  return (
    // technicalIndicators.bullish(data) ||
    // CROSS_SMA.isBuySignal(candles) ||
    RSI.isBuySignal(candles) || SMA.isBuySignal(candles)
  );
}

function isSellSignal(candles: Candle[]) {
  const data = {
    open: candles.map((candle) => Number(candle.open)),
    high: candles.map((candle) => Number(candle.high)),
    close: candles.map((candle) => Number(candle.close)),
    low: candles.map((candle) => Number(candle.low)),
  };
  return (
    // technicalIndicators.bearish(data) ||
    // CROSS_SMA.isSellSignal(candles) ||
    RSI.isSellSignal(candles) || SMA.isSellSignal(candles)
  );
}

/**
 * Get the quantity of a crypto to trade according to the available balance,
 * the allocation to take, and the current price of the crypto
 */
function getQuantity(
  pair: string,
  availableBalance: number,
  allocation: number,
  realtimePrice: number,
  exchangeInfo: ExchangeInfo
) {
  const minQuantity = Number(
    exchangeInfo.symbols
      .find((symbol) => symbol.symbol === pair)
      // @ts-ignore
      .filters.find((filter) => filter.filterType === 'LOT_SIZE').minQty
  );

  const quantity = Number(
    ((availableBalance * allocation) / realtimePrice).toFixed(
      getPrecision(realtimePrice)
    )
  );

  return quantity >= minQuantity ? quantity : minQuantity;
}

/**
 * Get the number of decimals
 */
function getPrecision(number: number) {
  return String(number).split('.').length === 2
    ? String(number).split('.')[1].length
    : 0;
}

function log(message: string) {
  logger.info(message);
  console.log(`${new Date(Date.now())} : ${message}`);
}

function error(message: string) {
  logger.warn(message);
  console.error(`${new Date(Date.now())} : ${message}`);
}

prepare();
run();
