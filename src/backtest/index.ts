import winston from 'winston';
import Binance from 'binance-api-node';
import { Bot, BINANCE_MODE } from './bot';
import { StochasticRsiConfig } from '../configs';

require('dotenv').config();

export const binanceClient = Binance({
  apiKey: process.env.BINANCE_PUBLIC_KEY,
  apiSecret: process.env.BINANCE_PRIVATE_KEY,
});

const TradingBot = new Bot(StochasticRsiConfig);
TradingBot.prepare();
TradingBot.run();
