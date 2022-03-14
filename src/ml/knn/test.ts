import fs from 'fs';
import path from 'path';
import { ClassifierBot } from '../../backtest/bots/classifierBot';
import { BotConfig } from '../../init';
import { create } from '@tensorflow-models/knn-classifier';
import { trainClassifier } from '.';

const configPath = path.resolve(process.cwd(), 'src/configs/knn.ts');

if (!fs.existsSync(configPath)) {
  console.error(`The strategy config file has not been found: ${configPath}`);
  process.exit(1);
}

const StrategyConfig = require('../../configs/knn').default;

if (process.env.NODE_ENV === 'test') {
  const BacktestConfig = BotConfig['backtest'];
  const startDate = new Date(BacktestConfig['start_date']);
  const endDate = new Date(BacktestConfig['end_date']);
  const initialCapital = BacktestConfig['initial_capital'];
  const strategyName = BotConfig['strategy_name'];

  const classifier = create();

  trainClassifier(classifier).then((classifier) => {
    const bot = new ClassifierBot(
      StrategyConfig,
      strategyName,
      startDate,
      endDate,
      initialCapital,
      classifier
    );

    bot.prepare();
    bot.run();
  });
}
