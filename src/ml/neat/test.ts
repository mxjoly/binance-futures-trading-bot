import fs from 'fs';
import path from 'path';
import { BackTestBot } from '../../backtest/bot';
import { BotConfig } from '../../init';
import { loadNeuralNetwork } from '../../ml/neat/saveManager';

const configPath = path.resolve(process.cwd(), 'src/configs/neat.ts');

if (!fs.existsSync(configPath)) {
  console.error(`The trade config file has not been found: ${configPath}`);
  process.exit(1);
}

const StrategyConfig = require('../../configs/neat').default;

if (process.env.NODE_ENV === 'test') {
  const BacktestConfig = BotConfig['backtest'];
  const startDate = new Date(BacktestConfig['start_date']);
  const endDate = new Date(BacktestConfig['end_date']);
  const initialCapital = BacktestConfig['initial_capital'];
  const strategyName = BotConfig['strategy_name'];

  // Use neural network ?
  const useNeuralNetwork = process.argv[3]
    ? process.argv[3].split('=')[1] === 'true'
      ? true
      : false
    : false;

  const bot = new BackTestBot(
    StrategyConfig,
    strategyName,
    startDate,
    endDate,
    initialCapital,
    useNeuralNetwork ? loadNeuralNetwork() : null
  );

  bot.prepare();
  bot.run();
}
