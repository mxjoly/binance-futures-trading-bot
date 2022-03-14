import { Bot } from './bot';
import { StrategyConfig } from './init';

if (process.env.NODE_ENV !== 'test') {
  const tradingBot = new Bot(StrategyConfig);
  tradingBot.prepare();
  tradingBot.run();
}
