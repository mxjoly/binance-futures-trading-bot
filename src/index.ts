import { Bot } from './bot';
import { BackTestBot } from './backtest/bot';
import { StrategyConfig, BotConfig } from './init';

if (process.env.NODE_ENV !== 'test') {
  const tradingBot = new Bot(StrategyConfig);
  tradingBot.prepare();
  tradingBot.run();
} else {
  const BacktestConfig = BotConfig['backtest'];
  const startDate = new Date(BacktestConfig['start_date']);
  const endDate = new Date(BacktestConfig['end_date']);
  const initialCapital = BacktestConfig['initial_capital'];
  const strategyName = BotConfig['strategy_name'];

  const bot = new BackTestBot(
    StrategyConfig,
    strategyName,
    startDate,
    endDate,
    initialCapital
  );

  bot.prepare();
  bot.run();
}
