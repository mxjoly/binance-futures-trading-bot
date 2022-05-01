import { BotConfig } from '../init';
import { StrategyConfig, StrategyHyperParameters } from '../init';
import { BasicBackTestBot } from './bot';

if (process.env.NODE_ENV === 'test') {
  const BacktestConfig = BotConfig['backtest'];
  const startDate = new Date(BacktestConfig['start_date']);
  const endDate = new Date(BacktestConfig['end_date']);
  const initialCapital = BacktestConfig['initial_capital'];
  const strategyName = BotConfig['strategy_name'];

  const bot = new BasicBackTestBot(
    StrategyConfig,
    StrategyHyperParameters,
    strategyName,
    startDate,
    endDate,
    initialCapital
  );

  bot.prepare();
  bot.run();
}
