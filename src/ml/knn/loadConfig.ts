import fs from 'fs';
import path from 'path';
import { BotConfig } from '../../init';

// ========================== STRATEGY CONFIG  ========================== //

const configPath = path.resolve(process.cwd(), 'src/configs/knn.ts');

if (!fs.existsSync(configPath)) {
  console.error(`The trade config file has not been found: ${configPath}`);
  process.exit(1);
}

const Config = require('../../configs/knn').default;

if (Config.length > 1) {
  console.error('You can use only one config in the knn classification.');
  process.exit(1);
}
if (Config.length === 0) {
  console.error('No config has been found.');
  process.exit(1);
}

export const StrategyConfig = Config[0];

// ========================== BOT CONFIG (json file) ========================== //

const KnnConfig = BotConfig['knn'];
const FeaturesConfig = KnnConfig['features'];

// Dates
export const startDateTraining = KnnConfig['start_date_training'];
export const endDateTraining = KnnConfig['end_date_training'];
export const startDateTest = KnnConfig['start_date_test'];
export const endDateTest = KnnConfig['end_date_test'];

// We consider this percent to take the decision to buy, sell or wait
export const PRICE_CHANGE = KnnConfig['price_change'];

// The ai try to predict the movement price in X bars
export const PREDICTION_PERIOD = KnnConfig['prediction_period'];

// The ai consider only the best prediction where the probability to get the right class/target is high
export const PREDICTION_THRESHOLD = KnnConfig['prediction_threshold'];

// Which indicators to use for our data set
export const FEATURES_INDICATORS = {
  EMA21: FeaturesConfig['EMA21'] || false,
  EMA50: FeaturesConfig['EMA50'] || false,
  EMA100: FeaturesConfig['EMA100'] || false,
  ADX: FeaturesConfig['ADX'] || false,
  AO: FeaturesConfig['AO'] || false,
  CCI: FeaturesConfig['CCI'] || false,
  MFI: FeaturesConfig['MFI'] || false,
  ROC: FeaturesConfig['ROC'] || false,
  RSI: FeaturesConfig['RSI'] || false,
  WILLIAM_R: FeaturesConfig['WILLIAM_R'] || false,
  KIJUN: FeaturesConfig['KIJUN'] || false,
  VWAP: FeaturesConfig['VWAP'] || false,
  VOL_OSC: FeaturesConfig['VOL_OSC'] || false,
  PRICE_CHANGE: FeaturesConfig['PRICE_CHANGE'] || false,
  VOL: FeaturesConfig['VOL'] || false,
};
