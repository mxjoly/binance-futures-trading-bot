import winston from 'winston';
import Binance from 'binance-api-node';
import { Bot } from './bot';
import { tradeConfigs } from './config';

require('dotenv').config();

export const logger = winston.createLogger({
  level: 'info',
  format: winston.format.simple(),
  transports: [new winston.transports.File({ filename: 'logs/bot.log' })],
});

const binanceClient = Binance({
  apiKey: process.env.BINANCE_PUBLIC_KEY,
  apiSecret: process.env.BINANCE_PRIVATE_KEY,
});

// ****************************************************************************** //

const TradingBot = new Bot(binanceClient, tradeConfigs);
TradingBot.prepare();
TradingBot.run();
