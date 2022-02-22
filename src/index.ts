import fs from 'fs';
import Binance from 'binance-api-node';
import { createLogger, transports, format } from 'winston';
import { Bot } from './bot';
import { BackTestBot } from './backtest/bot';
import Config from './configs/rsi';
import { initializePlugins } from './utils/plugins';

// Initialize environment variables
require('dotenv').config();

// Initialize the plugins of dayjs
initializePlugins();

const loggerFilePath = {
  production: 'logs/bot-prod.log',
  development: 'logs/bot-dev.log',
  test: 'logs/bot-test.log',
};

if (fs.existsSync(loggerFilePath[process.env.NODE_ENV])) {
  fs.unlinkSync(loggerFilePath[process.env.NODE_ENV]);
}

export const logger = createLogger({
  level: 'info',
  format: format.simple(),
  transports: [
    new transports.File({
      filename: loggerFilePath[process.env.NODE_ENV],
    }),
  ],
});

// The bot will trade with the binance :
export const BINANCE_MODE: BinanceMode = 'futures';

export const binanceClient = Binance(
  process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'test'
    ? {
        apiKey: process.env.BINANCE_PUBLIC_KEY,
        apiSecret: process.env.BINANCE_PRIVATE_KEY,
      }
    : {
        apiKey:
          // @ts-ignore
          BINANCE_MODE === 'spot'
            ? process.env.BINANCE_SPOT_TESTNET_PUBLIC_KEY
            : process.env.BINANCE_FUTURES_TESTNET_PUBLIC_KEY,
        apiSecret:
          // @ts-ignore
          BINANCE_MODE === 'spot'
            ? process.env.BINANCE_SPOT_TESTNET_PRIVATE_KEY
            : process.env.BINANCE_FUTURES_TESTNET_PRIVATE_KEY,
        httpBase: 'https://testnet.binance.vision',
        wsBase: 'wss://testnet.binance.vision/ws',
        httpFutures: 'https://testnet.binancefuture.com',
        wsFutures: 'wss://fstream.binance.com/ws',
      }
);

if (process.env.NODE_ENV !== 'test') {
  const tradingBot = new Bot(Config);
  tradingBot.prepare();
  tradingBot.run();
} else {
  const startDate = new Date('2021-01-01 00:00:00');
  const endDate = new Date('2022-01-01 00:00:00');
  const initialCapital = 10000;

  const bot = new BackTestBot(Config, startDate, endDate);
  bot.prepare(initialCapital);
  bot.run();
}
