import winston from 'winston';
import Binance from 'binance-api-node';
import { Bot } from './bot';
import { DivergenceConfig } from './configs';

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

const TradingBot = new Bot(binanceClient, DivergenceConfig);
TradingBot.prepare();
TradingBot.run();
