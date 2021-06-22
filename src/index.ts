import Binance from 'binance-api-node';
import { Bot } from './bot';
import { tradeConfigs } from './config';

export const binanceClient = Binance({
  apiKey: process.env.BINANCE_PUBLIC_KEY,
  apiSecret: process.env.BINANCE_PRIVATE_KEY,
});

const TradingBot = new Bot(binanceClient, tradeConfigs);
TradingBot.prepare();
TradingBot.run();
