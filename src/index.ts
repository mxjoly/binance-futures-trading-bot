import winston from 'winston';
import Binance from 'binance-api-node';
import { Bot } from './bot';
import { tradeConfigs } from './config';

require('dotenv').config();

// To use binance testnet or mainnet
const TEST_MODE = false;

export const logger = winston.createLogger({
  level: 'info',
  format: winston.format.simple(),
  transports: [new winston.transports.File({ filename: 'logs/bot.log' })],
});

const binanceClient = TEST_MODE
  ? Binance({
      apiKey: process.env.BINANCE_TEST_PUBLIC_KEY,
      apiSecret: process.env.BINANCE_TEST_PRIVATE_KEY,
    })
  : Binance({
      apiKey: process.env.BINANCE_PUBLIC_KEY,
      apiSecret: process.env.BINANCE_PRIVATE_KEY,
    });

// ****************************************************************************** //

const TradingBot = new Bot(binanceClient, tradeConfigs);
TradingBot.prepare();
TradingBot.run();
