import express from 'express';
import winston from 'winston';
import Binance from 'binance-api-node';
import { Bot } from './bot';
import { tradeConfigs } from './config';

require('dotenv').config();

export const logger = winston.createLogger({
  level: 'info',
  format: winston.format.simple(),
  transports: [new winston.transports.File({ filename: 'log/bot.log' })],
});

const binanceClient = Binance({
  apiKey: process.env.BINANCE_PUBLIC_KEY,
  apiSecret: process.env.BINANCE_PRIVATE_KEY,
});

const app = express();
const port = process.env.PORT || 3000;

// ****************************************************************************** //

app.get('**', (req, res) => {
  const TradingBot = new Bot(binanceClient, tradeConfigs);
  TradingBot.prepare();
  TradingBot.run();
  res.send();
});

app.listen(port, () => {
  console.log(`Trading bot is running now at port ${port}`);
});
