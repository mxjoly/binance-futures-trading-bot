import winston from 'winston';
import Binance from 'binance-api-node';
import { Bot } from './bot';
import { BackTestBot } from './backtest/bot';
import Config from './configs/rsi';
import { initializePlugins } from './utils/plugins';

// Initialize environment variables
require('dotenv').config();

// Initialize the plugins of dayjs
initializePlugins();

// Log
export const logger = winston.createLogger({
  level: 'info',
  format: winston.format.simple(),
  transports: [new winston.transports.File({ filename: 'logs/bot.log' })],
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
  const startDate = new Date('January 01, 2022 00:00:00');
  const endDate = new Date('January 01, 2022 10:00:00');
  const initialCapital = 10000;

  const bot = new BackTestBot(Config, startDate, endDate);
  bot.prepare(initialCapital);
  bot.run();
}
