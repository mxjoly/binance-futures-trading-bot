import winston from 'winston';
import Binance, { Candle, CandleChartInterval } from 'binance-api-node';
import { isBuySignalRSI, isSellSignalRSI } from './rsi';

require('dotenv').config();

const tradeConfigs: TradeConfig[] = [
  {
    mode: 'futures',
    asset: 'BTC',
    base: 'USDT',
    allocation: 0.1,
    lossTolerance: 0.03,
    profitTarget: 0.1,
    interval: CandleChartInterval.FIFTEEN_MINUTES,
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

  logger.info('Bot is ready to work !');
}

function run() {
  logger.info('Bot is searching the good trades...');

  // SPOT
  tradeConfigs
    .filter((tradeConfig) => tradeConfig.mode === 'spot')
    .forEach((tradeConfig) => {
      logger.info(
        `Spot : Bot is checking the ${tradeConfig.asset}/${tradeConfig.base}...`
      );

      const pair = tradeConfig.asset + tradeConfig.base;

      binanceClient.ws.candles(pair, tradeConfig.interval, (candle) => {
        const candles = closeCandles[pair];

        if (candles.length > MAX_SAVED_CANDLES) candles.splice(1);

        // Add only the closed candle
        if (candle.isFinal) candles.push(candle);

        tradeWithSpot(tradeConfig, candles, Number(candle.close));
      });
    });

  // FUTURES
  tradeConfigs
    .filter((tradeConfig) => tradeConfig.mode === 'futures')
    .forEach((tradeConfig) => {
      logger.info(
        `Futures : Bot is checking the ${tradeConfig.asset}/${tradeConfig.base}...`
      );

      const pair = tradeConfig.asset + tradeConfig.base;

      // @ts-ignore
      binanceClient.ws.futuresCandles(
        pair,
        tradeConfig.interval,
        (candle: Candle) => {
          const candles = closeCandles[pair];

          if (candles.length > MAX_SAVED_CANDLES) candles.splice(1);

          // Add only the closed candle
          if (candle.isFinal) candles.push(candle);

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
  binanceClient.accountInfo().then(({ balances }) => {
    const base = Number(
      balances.find((balance) => balance.asset === tradeConfig.base).free
    );

    // Allow trading with a minimum of balance
    if (base >= MIN_FREE_BALANCE_FOR_SPOT_TRADING) {
      binanceClient
        .myTrades({ symbol: tradeConfig.asset + tradeConfig.base })
        .then((trades) => {
          if (trades.length === 0 && isBuySignal(candles)) {
            const purchasePrice = realtimePrice * 1.01;
            // Buy limit order
            binanceClient.order({
              side: 'BUY',
              type: 'LIMIT',
              symbol: tradeConfig.asset + tradeConfig.base,
              price: String(purchasePrice),
              quantity: String(100 * tradeConfig.allocation),
            });

            if (tradeConfig.profitTarget) {
              // Sell oco order as TP/SL
              binanceClient.orderOco({
                side: 'SELL',
                symbol: tradeConfig.asset + tradeConfig.base,
                price: String(purchasePrice * (1 + tradeConfig.profitTarget)), // TP
                stopPrice: String(
                  purchasePrice * (1 - tradeConfig.lossTolerance)
                ),
                stopLimitPrice: String(
                  purchasePrice * (1 - tradeConfig.lossTolerance)
                ), // SL
                quantity: '100',
              });

              logger.info(
                `Spot : Bot created a buy limit order for ${
                  tradeConfig.asset
                }/${
                  tradeConfig.base
                } at the price ${purchasePrice} with TP/SL: ${
                  purchasePrice * (1 + tradeConfig.profitTarget)
                }/${purchasePrice * (1 - tradeConfig.lossTolerance)}`
              );
            } else {
              // Sell limit order as SL
              binanceClient.order({
                side: 'SELL',
                type: 'LIMIT',
                symbol: tradeConfig.asset + tradeConfig.base,
                price: String(purchasePrice * (1 - tradeConfig.lossTolerance)),
                quantity: '100',
              });

              logger.info(
                `Spot : Bot created a buy limit order for ${
                  tradeConfig.asset
                }/${
                  tradeConfig.base
                } at the price ${purchasePrice} with TP/SL: ---/${
                  purchasePrice * (1 - tradeConfig.lossTolerance)
                }`
              );
            }
          }
        })
        .catch(logger.warning);
    }
  });
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

      // Allow trading with a minimum of balance
      if (base >= MIN_FREE_BALANCE_FOR_FUTURE_TRADING) {
        if (isBuySignal(candles)) {
          const purchasePrice = realtimePrice * 1.01;
          // Buy limit order
          binanceClient.futuresOrder({
            side: 'BUY',
            type: 'LIMIT',
            symbol: tradeConfig.asset + tradeConfig.base,
            isIsolated: true,
            price: String(purchasePrice),
            quantity: String(Math.round(100 * tradeConfig.allocation)),
          });

          if (tradeConfig.profitTarget) {
            // Take profit order
            binanceClient.futuresOrder({
              side: 'SELL',
              type: 'TAKE_PROFIT_MARKET',
              symbol: tradeConfig.asset + tradeConfig.base,
              isIsolated: true,
              price: String(purchasePrice * (1 + tradeConfig.profitTarget)),
              quantity: '100',
            });
          }

          // Stop loss order
          binanceClient.futuresOrder({
            side: 'SELL',
            type: 'STOP_MARKET',
            symbol: tradeConfig.asset + tradeConfig.base,
            isIsolated: true,
            stopPrice: String(purchasePrice * (1 - tradeConfig.lossTolerance)),
            quantity: '100',
          });

          logger.info(
            `Futures : Bot created a buy limit order for ${tradeConfig.asset}/${
              tradeConfig.base
            } at the price ${purchasePrice} with TP/SL: ${
              tradeConfig.profitTarget
                ? purchasePrice * (1 + tradeConfig.profitTarget)
                : '----'
            }/${purchasePrice * (1 - tradeConfig.lossTolerance)}`
          );
        } else if (isSellSignal(candles)) {
          const purchasePrice = realtimePrice * 0.99;
          // Sell limit order
          binanceClient.futuresOrder({
            side: 'SELL',
            type: 'LIMIT',
            symbol: tradeConfig.asset + tradeConfig.base,
            isIsolated: true,
            price: String(purchasePrice),
            quantity: String(Math.round(100 * tradeConfig.allocation)),
          });

          if (tradeConfig.profitTarget) {
            // Take profit order
            binanceClient.futuresOrder({
              side: 'SELL',
              type: 'TAKE_PROFIT_MARKET',
              symbol: tradeConfig.asset + tradeConfig.base,
              isIsolated: true,
              price: String(purchasePrice * (1 - tradeConfig.profitTarget)),
              quantity: '100',
            });
          }

          // Stop loss order
          binanceClient.futuresOrder({
            side: 'SELL',
            type: 'STOP_MARKET',
            symbol: tradeConfig.asset + tradeConfig.base,
            isIsolated: true,
            stopPrice: String(purchasePrice * (1 + tradeConfig.lossTolerance)),
            quantity: '100',
          });

          logger.info(
            `Futures : Bot created a buy limit order for ${tradeConfig.asset}/${
              tradeConfig.base
            } at the price ${purchasePrice} with TP/SL: ${
              tradeConfig.profitTarget
                ? purchasePrice * (1 - tradeConfig.profitTarget)
                : '----'
            }/${purchasePrice * (1 + tradeConfig.lossTolerance)}`
        }
      }
    })
    .catch(logger.warning);
}

function isBuySignal(candles: Candle[]) {
  return isBuySignalRSI(candles);
}

function isSellSignal(candles: Candle[]) {
  return isSellSignalRSI(candles);
}

prepare();
run();
