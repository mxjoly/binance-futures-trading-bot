import winston from 'winston';
import Binance, { Candle, CandleChartInterval } from 'binance-api-node';
import indicators, { RSI, SMA } from './indicators';

require('dotenv').config();

const tradeConfigs: TradeConfig[] = [
  {
    mode: 'futures',
    asset: 'BTC',
    base: 'USDT',
    allocation: 0.005,
    lossTolerance: 0.03,
    profitTarget: 0.1,
    interval: CandleChartInterval.ONE_MINUTE,
  },
];

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.simple(),
  defaultMeta: { date: new Date(Date.now()) },
  transports: [new winston.transports.File({ filename: 'bot.log' })],
});

const binanceClient = Binance({
  apiKey: process.env.BINANCE_PUBLIC_KEY,
  apiSecret: process.env.BINANCE_PRIVATE_KEY,
});

const closeCandles: { [key: string]: Candle[] } = {};

// ============================ CONST =================================== //
const MAX_SAVED_CANDLES = 100; // max candles for each crypto to store for analysis
const MIN_FREE_BALANCE_FOR_SPOT_TRADING = 50;
const MIN_FREE_BALANCE_FOR_FUTURE_TRADING = 50;
// ====================================================================== //

function prepare() {
  // Initialize array of closes candles
  tradeConfigs
    .map((tradeConfig) => tradeConfig.asset + tradeConfig.base)
    .forEach((pair) => {
      closeCandles[pair] = [];
    });

  // Set the initial leverage for the futures
  tradeConfigs
    .filter((tradeConfig) => (tradeConfig.mode = 'futures'))
    .forEach((tradeConfig) => {
      binanceClient
        .futuresLeverage({
          symbol: tradeConfig.asset + tradeConfig.base,
          leverage: tradeConfig.leverage || 2,
        })
        .catch(logger.warning);
    });

  log('Bot is ready to work !');
}

function run() {
  log('Bot is searching the good trades...');

  // SPOT
  tradeConfigs
    .filter((tradeConfig) => tradeConfig.mode === 'spot')
    .forEach(async (tradeConfig) => {
      const pair = tradeConfig.asset + tradeConfig.base;

      log(
        `@Spot / Bot is checking the pair ${tradeConfig.asset}/${tradeConfig.base}`
      );

      binanceClient.ws.candles(pair, tradeConfig.interval, (candle) => {
        const candles = closeCandles[pair];

        if (candles.length > MAX_SAVED_CANDLES) candles.slice(1);

        // Add only the closed candle
        if (candle.isFinal) candles.push(candle);

        tradeWithSpot(tradeConfig, candles, Number(candle.close));
      });
    });

  // FUTURES
  tradeConfigs
    .filter((tradeConfig) => tradeConfig.mode === 'futures')
    .forEach(async (tradeConfig) => {
      const pair = tradeConfig.asset + tradeConfig.base;

      log(
        `@Futures / Bot is checking the pair ${tradeConfig.asset}/${tradeConfig.base}`
      );

      // @ts-ignore
      binanceClient.ws.futuresCandles(
        pair,
        tradeConfig.interval,
        (candle: Candle) => {
          const candles = closeCandles[pair];

          if (candles.length > MAX_SAVED_CANDLES) candles.slice(1);

          // Add only the closed candle
          if (candle.isFinal) candles.push(candle);

          tradeWithFutures(tradeConfig, candles, Number(candle.close));
        }
      );
    });
}

async function tradeWithSpot(
  tradeConfig: TradeConfig,
  candles: Candle[],
  realtimePrice: number
) {
  const pair = `${tradeConfig.asset}${tradeConfig.base}`;

  const { balances } = await binanceClient.accountInfo();
  const availableBalance = Number(
    balances.find((balance) => balance.asset === tradeConfig.base).free
  );

  const precision =
    String(realtimePrice).split('.').length === 2
      ? String(realtimePrice).split('.')[1].length
      : 0;

  // const currentTrades = await binanceClient.myTrades({ symbol: pair });

  // Allow trading with a minimum of balance
  if (availableBalance >= MIN_FREE_BALANCE_FOR_SPOT_TRADING) {
    if (isBuySignal(candles)) {
      const purchasePrice = calculatePrice(realtimePrice, 1.01, precision);
      const takeProfitPrice = tradeConfig.profitTarget
        ? calculatePrice(purchasePrice, 1 + tradeConfig.profitTarget, precision)
        : null;
      const stopLossPrice = calculatePrice(
        purchasePrice,
        1 - tradeConfig.lossTolerance,
        precision
      );

      // Buy limit order
      binanceClient.order({
        side: 'BUY',
        type: 'LIMIT',
        symbol: pair,
        price: String(purchasePrice),
        quantity: String(Math.round(100 * tradeConfig.allocation)),
      });

      if (takeProfitPrice) {
        // Sell oco order as TP/SL
        binanceClient.orderOco({
          side: 'SELL',
          symbol: pair,
          price: String(takeProfitPrice),
          stopPrice: String(stopLossPrice),
          stopLimitPrice: String(stopLossPrice),
          quantity: '100',
        });
      } else {
        // Sell limit order as SL
        binanceClient.order({
          side: 'SELL',
          type: 'LIMIT',
          symbol: pair,
          price: String(stopLossPrice),
          quantity: '100',
        });

        log(
          `@Spot / Bot bought ${tradeConfig.asset} with ${
            tradeConfig.base
          } at the price ${purchasePrice}. TP/SL: ${
            takeProfitPrice ? takeProfitPrice : '----'
          }/${stopLossPrice}`
        );
      }
    }
  }
}

async function tradeWithFutures(
  tradeConfig: TradeConfig,
  candles: Candle[],
  realtimePrice: number
) {
  const pair = `${tradeConfig.asset}${tradeConfig.base}`;

  const balances = await binanceClient.futuresAccountBalance();
  const availableBalance = Number(
    balances.find((balance) => balance.asset === tradeConfig.base)
      .availableBalance
  );

  const precision =
    String(realtimePrice).split('.').length === 2
      ? String(realtimePrice).split('.')[1].length
      : 0;

  // const currentTrades = await binanceClient.futuresTrades({ symbol: pair });

  // Allow trading with a minimum of balance
  if (availableBalance >= MIN_FREE_BALANCE_FOR_FUTURE_TRADING) {
    if (isBuySignal(candles)) {
      const purchasePrice = calculatePrice(realtimePrice, 1.01, precision);
      const takeProfitPrice = tradeConfig.profitTarget
        ? calculatePrice(purchasePrice, 1 + tradeConfig.profitTarget, precision)
        : null;
      const stopLossPrice = calculatePrice(
        purchasePrice,
        1 - tradeConfig.lossTolerance,
        precision
      );

      // Buy limit order
      binanceClient.futuresOrder({
        side: 'BUY',
        type: 'LIMIT',
        symbol: pair,
        isIsolated: true,
        price: String(purchasePrice),
        quantity: String(Math.round(100 * tradeConfig.allocation)),
      });

      if (takeProfitPrice) {
        // Take profit order
        binanceClient.futuresOrder({
          side: 'SELL',
          type: 'TAKE_PROFIT_MARKET',
          symbol: pair,
          isIsolated: true,
          price: String(takeProfitPrice),
          quantity: '100',
        });
      }

      // Stop loss order
      binanceClient.futuresOrder({
        side: 'SELL',
        type: 'STOP_MARKET',
        symbol: pair,
        isIsolated: true,
        stopPrice: String(stopLossPrice),
        quantity: '100',
      });

      log(
        `@Futures : Bot takes a long for ${pair} at the price ${purchasePrice} with TP/SL: ${
          takeProfitPrice ? takeProfitPrice : '----'
        }/${stopLossPrice}`
      );
    } else if (isSellSignal(candles)) {
      const purchasePrice = calculatePrice(realtimePrice, 0.99, precision);
      const takeProfitPrice = tradeConfig.profitTarget
        ? calculatePrice(purchasePrice, 1 - tradeConfig.profitTarget, precision)
        : null;
      const stopLossPrice = calculatePrice(
        purchasePrice,
        1 + tradeConfig.lossTolerance,
        precision
      );

      // Sell limit order
      binanceClient.futuresOrder({
        side: 'SELL',
        type: 'LIMIT',
        symbol: pair,
        isIsolated: true,
        price: String(purchasePrice),
        quantity: String(Math.round(100 * tradeConfig.allocation)),
      });

      if (takeProfitPrice) {
        // Take profit order
        binanceClient.futuresOrder({
          side: 'BUY',
          type: 'TAKE_PROFIT_MARKET',
          symbol: pair,
          isIsolated: true,
          price: String(takeProfitPrice),
          quantity: '100',
        });
      }

      // Stop loss order
      binanceClient.futuresOrder({
        side: 'BUY',
        type: 'STOP_MARKET',
        symbol: pair,
        isIsolated: true,
        stopPrice: String(stopLossPrice),
        quantity: '100',
      });

      log(
        `@Futures : Bot takes a short for ${pair} at the price ${purchasePrice} with TP/SL: ${
          takeProfitPrice ? takeProfitPrice : '----'
        }/${stopLossPrice}`
      );
    }
  }
}

function calculatePrice(price: number, percent: number, precision?: number) {
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
    // indicators.bullish(data) ||
    // RSI.isBuySignal(candles) ||
    SMA.isBuySignal(candles)
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
    // indicators.bearish(data) ||
    // RSI.isSellSignal(candles) ||
    SMA.isSellSignal(candles)
  );
}

function log(message: string) {
  logger.info(message);
  console.log(`${new Date(Date.now())} : ${message}`);
}

prepare();
run();
