import winston from 'winston';
import Binance from 'binance-api-node';
import { Bot, BINANCE_MODE } from './bot';
import { StochasticRsiConfig } from './configs';

require('dotenv').config();

export const logger = winston.createLogger({
  level: 'info',
  format: winston.format.simple(),
  transports: [new winston.transports.File({ filename: 'logs/bot.log' })],
});

export const binanceClient = Binance(
  process.env.NODE_ENV === 'production'
    ? {
        apiKey: process.env.BINANCE_PUBLIC_KEY,
        apiSecret: process.env.BINANCE_PRIVATE_KEY,
      }
    : {
        apiKey:
          BINANCE_MODE == 'spot'
            ? process.env.BINANCE_SPOT_TESTNET_PUBLIC_KEY
            : process.env.BINANCE_FUTURES_TESTNET_PUBLIC_KEY,
        apiSecret:
          BINANCE_MODE == 'spot'
            ? process.env.BINANCE_SPOT_TESTNET_PRIVATE_KEY
            : process.env.BINANCE_FUTURES_TESTNET_PRIVATE_KEY,
        httpBase: 'https://testnet.binance.vision',
        wsBase: 'wss://testnet.binance.vision/ws',
        httpFutures: 'https://testnet.binancefuture.com',
        wsFutures: 'wss://fstream.binance.com/ws',
      }
);

const TradingBot = new Bot(StochasticRsiConfig);
TradingBot.prepare();
TradingBot.run();
