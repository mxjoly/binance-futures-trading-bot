import fs from 'fs';
import path from 'path';
import { BotConfig } from '../../init';

// ========================== STRATEGY CONFIG  ========================== //

const configPath = path.resolve(process.cwd(), 'src/configs/neat.ts');

if (!fs.existsSync(configPath)) {
  console.error(`The trade config file has not been found: ${configPath}`);
  process.exit(1);
}

const Config = require('../../configs/neat').default;

if (Config.length > 1) {
  console.error('You can use only one config in the neat algorithm.');
  process.exit(1);
}
if (Config.length === 0) {
  console.error('No config has been found.');
  process.exit(1);
}

export const StrategyConfig = Config[0];

// ========================== BOT CONFIG (json file) ========================== //

const NeatConfig = BotConfig['neat'];
export const NeuralNetworkConfig = NeatConfig['neural_network'];
export const CandleInputsConfig = NeuralNetworkConfig['candle_inputs'];
export const GoalsConfig = NeatConfig['goals'];
export const IndicatorInputsConfig = NeuralNetworkConfig['indicator_inputs'];

// Common parameters for the genetic algorithm
export const totalPopulation = NeatConfig['population'];
export const totalGenerations = NeatConfig['generations'];
export const initialCapital = NeatConfig['initial_capital'];
export const startDateTraining = NeatConfig['start_date_training'];
export const endDateTraining = NeatConfig['end_date_training'];
export const startDateTest = NeatConfig['start_date_test'];
export const endDateTest = NeatConfig['end_date_test'];

// Goals to reach
export const winRate = GoalsConfig['win_rate'];
export const profitRatio = GoalsConfig['profit_ratio'];
export const maxRelativeDrawdown = GoalsConfig['max_relative_drawdown'];

export const NEURAL_NETWORK_INPUTS_MODE = NeuralNetworkConfig['inputs_mode'];
export const CANDLE_LENGTH_INPUTS = CandleInputsConfig['length'];
export const CANDLE_SOURCE = CandleInputsConfig['source'];

// Configure the inputs of the neural network
export const NEURAL_NETWORK_INDICATORS_INPUTS = {
  EMA21: IndicatorInputsConfig['EMA21'] || false,
  EMA50: IndicatorInputsConfig['EMA50'] || false,
  EMA100: IndicatorInputsConfig['EMA100'] || false,
  ADX: IndicatorInputsConfig['ADX'] || false,
  AO: IndicatorInputsConfig['AO'] || false,
  CCI: IndicatorInputsConfig['CCI'] || false,
  MFI: IndicatorInputsConfig['MFI'] || false,
  ROC: IndicatorInputsConfig['ROC'] || false,
  RSI: IndicatorInputsConfig['RSI'] || false,
  WILLIAM_R: IndicatorInputsConfig['WILLIAM_R'] || false,
  KIJUN: IndicatorInputsConfig['KIJUN'] || false,
  VWAP: IndicatorInputsConfig['VWAP'] || false,
  VOL_OSC: IndicatorInputsConfig['VOL_OSC'] || false,
  PRICE_CHANGE: IndicatorInputsConfig['PRICE_CHANGE'] || false,
  VOL: IndicatorInputsConfig['VOL'] || false,
};

export const NEURAL_NETWORK_INPUTS =
  NEURAL_NETWORK_INPUTS_MODE === 'candles'
    ? CANDLE_LENGTH_INPUTS
    : Object.entries(NEURAL_NETWORK_INDICATORS_INPUTS).filter(
        ([, val]) => val === true
      ).length;

export const NEURAL_NETWORK_OUTPUTS = 2; // Buy / Sell

export const CANDLE_MIN_LENGTH = 150; // the trader start to trade when it can see X candles
