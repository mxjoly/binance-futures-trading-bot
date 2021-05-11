import winston from 'winston';
import Binance, { Candle, CandleChartInterval } from 'binance-api-node';
import { isBuySignalRSI, isSellSignalRSI } from './rsi';

require('dotenv').config();

const tradeConfigs: TradeConfig[] = [
  {
    mode: 'futures',
    asset: 'BTC',
    base: 'USDT',
    allocation: 0.05,
    lossTolerance: 0.1,
    profitTarget: 0.3,
    period: 33,
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
}

function run() {
  // SPOT
  tradeConfigs
    .filter((tradeConfig) => tradeConfig.mode === 'spot')
    .forEach((tradeConfig) => {
      const pair = tradeConfig.asset + tradeConfig.base;
      binanceClient.ws.candles(pair, tradeConfig.interval, (candle) => {
        const candles = closeCandles[pair];

        // Get only the candles for the trade period
        if (candles.length > tradeConfig.period) candles.splice(1);

        // Add the new candle
        if (candle.isFinal) {
          candles.push(candle);
        }

        tradeWithSpot(tradeConfig, candles, Number(candle.close));
      });
    });

  // FUTURES
  tradeConfigs
    .filter((tradeConfig) => tradeConfig.mode === 'futures')
    .forEach((tradeConfig) => {
      const pair = tradeConfig.asset + tradeConfig.base;
      // @ts-ignore
      binanceClient.ws.futuresCandles(
        pair,
        tradeConfig.interval,
        (candle: Candle) => {
          const candles = closeCandles[pair];

          // Get only the candles for the trade period
          if (candles.length > tradeConfig.period) candles.splice(1);

          // Add the new candle
          if (candle.isFinal) {
            candles.push(candle);
          }

          tradeWithFutures(tradeConfig, candles, Number(candle.close));
        }
      );
    });
}

function tradeWithSpot(
  tradeConfig: TradeConfig,
  candles: Candle[],
  realtimePrice: number
) {
  binanceClient
    .accountInfo()
    .then(({ balances }) => {
      // Balance free crypto
      const asset = Number(
        balances.find((balance) => balance.asset === tradeConfig.asset).free
      );
      const base = Number(
        balances.find((balance) => balance.asset === tradeConfig.base).free
      );

      binanceClient
        .myTrades({ symbol: tradeConfig.asset + tradeConfig.base })
        .then((trades) => {
          if (trades.length === 0 && isBuySignal(tradeConfig, candles)) {
            // Buy limit order
            binanceClient.order({
              side: 'BUY',
              type: 'LIMIT',
              symbol: tradeConfig.asset + tradeConfig.base,
              price: String(realtimePrice * 0.01),
              quantity: String((base * tradeConfig.allocation) / realtimePrice),
            });

            if (tradeConfig.profitTarget) {
              // Sell oco order
              binanceClient.orderOco({
                side: 'SELL',
                symbol: tradeConfig.asset + tradeConfig.base,
                price: String(realtimePrice * tradeConfig.profitTarget),
                stopPrice: String(realtimePrice * tradeConfig.lossTolerance),
                stopLimitPrice: String(
                  realtimePrice * tradeConfig.lossTolerance
                ),
                quantity: String(asset),
              });
            } else {
              // Sell limit order
              binanceClient.order({
                side: 'SELL',
                type: 'LIMIT',
                symbol: tradeConfig.asset + tradeConfig.base,
                price: String(realtimePrice * tradeConfig.lossTolerance),
                quantity: String(asset),
              });
            }
          }
        })
        .catch(logger.warning);
    })
    .catch(logger.warning);
}

function tradeWithFutures(
  tradeConfig: TradeConfig,
  candles: Candle[],
  realtimePrice: number
) {
  binanceClient
    .futuresAccountBalance()
    .then((balances) => {
      // Balance free crypto
      const base = Number(
        balances.find((balance) => balance.asset === tradeConfig.base)
          .availableBalance
      );

      binanceClient
        .futuresTrades({
          symbol: tradeConfig.asset + tradeConfig.base,
        })
        .then((trades) => {
          if (trades.length > 0) {
          } else if (isBuySignalRSI(tradeConfig, candles)) {
            binanceClient.futuresOrder({
              side: 'BUY',
              type: 'LIMIT',
              symbol: tradeConfig.asset + tradeConfig.base,
              isIsolated: true,
            });
            binanceClient.futuresOrder({
              side: 'SELL',
              type: 'TAKE_PROFIT_MARKET',
              symbol: tradeConfig.asset + tradeConfig.base,
            });
          } else if (isSellSignalRSI(tradeConfig, candles)) {
          }
        })
        .catch(logger.warning);
    })
    .catch(logger.warning);
}

function isBuySignal(tradeConfig: TradeConfig, candles: Candle[]) {
  return isBuySignalRSI(tradeConfig, candles);
}

function isSellSignal(tradeConfig: TradeConfig, candles: Candle[]) {
  return isSellSignalRSI(tradeConfig, candles);
}

prepare();
run();
