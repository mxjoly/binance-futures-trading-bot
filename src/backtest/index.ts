import winston from 'winston';
import Binance from 'binance-api-node';
import { Bot, BINANCE_MODE } from './bot';
import { StochasticRsiConfig } from '../configs';

require('dotenv').config();

export const binanceClient = Binance({
  apiKey: process.env.BINANCE_PUBLIC_KEY,
  apiSecret: process.env.BINANCE_PRIVATE_KEY,
});

const startDate = new Date('January 01, 2022 00:00:00');
const endDate = new Date('January 01, 2022 23:59:59');

const BackTestBot = new Bot(StochasticRsiConfig, startDate, endDate);
BackTestBot.run();
