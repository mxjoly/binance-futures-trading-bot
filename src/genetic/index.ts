import chalk from 'chalk';
import Binance from 'binance-api-node';
import { BotConfig } from '../init';
import { loadCandlesFromCSV } from '../utils/candleData';
import Config from '../configs/genetic';
import { decimalCeil, decimalFloor } from '../utils/math';
import Population from './population';
import * as VolumeOscillator from '../indicators/volumeOscillator';
import {
  ADX,
  AwesomeOscillator,
  CCI,
  EMA,
  IchimokuCloud,
  MFI,
  ROC,
  RSI,
  VWAP,
  WilliamsR,
} from 'technicalindicators';
import Trader from './player';

// ===================================================================================================

const GeneticConfig = BotConfig['genetic'];
const NeuralNetworkConfig = GeneticConfig['neural_network'];
const CandleInputsConfig = NeuralNetworkConfig['candle_inputs'];
const IndicatorInputsConfig = NeuralNetworkConfig['indicator_inputs'];
const GoalsConfig = GeneticConfig['goals'];

// Common parameters for the genetic algorithm
const totalPopulation = GeneticConfig['population'];
const totalGenerations = GeneticConfig['generations'];
const initialCapital = GeneticConfig['initial_capital'];
const startDateTraining = GeneticConfig['start_date_training'];
const endDateTraining = GeneticConfig['end_date_training'];
const startDateTest = GeneticConfig['start_date_test'];
const endDateTest = GeneticConfig['end_date_test'];

// Goals to reach
const winRate = GoalsConfig['win_rate'];
const profitRatio = GoalsConfig['profit_ratio'];
const maxRelativeDrawdown = GoalsConfig['max_relative_drawdown'];

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

const NEURAL_NETWORK_INPUTS =
  NEURAL_NETWORK_INPUTS_MODE === 'candles'
    ? CANDLE_LENGTH_INPUTS
    : Object.entries(NEURAL_NETWORK_INDICATORS_INPUTS).filter(
        ([, val]) => val === true
      ).length;

const NEURAL_NETWORK_OUTPUTS = 3; // Buy / Sell / Wait

// ===================================================================================================

/**
 * Calculate the indicator values
 * @param candles
 */
function calculateIndicators(candles: CandleData[]) {
  // EMA21
  const ema21 =
    NEURAL_NETWORK_INDICATORS_INPUTS.EMA21 === true
      ? EMA.calculate({
          period: 21,
          values: candles.map((c) => c.close).slice(-21),
        }).slice(-1)[0]
      : null;

  // EMA50
  const ema50 = NEURAL_NETWORK_INDICATORS_INPUTS.EMA50
    ? EMA.calculate({
        period: 50,
        values: candles.map((c) => c.close).slice(-50),
      }).slice(-1)[0]
    : null;

  // EMA100
  const ema100 = NEURAL_NETWORK_INDICATORS_INPUTS.EMA100
    ? EMA.calculate({
        period: 100,
        values: candles.map((c) => c.close).slice(-100),
      }).slice(-1)[0]
    : null;

  // Average Directional Index
  const adx = NEURAL_NETWORK_INDICATORS_INPUTS.ADX
    ? ADX.calculate({
        period: 14,
        close: candles.map((c) => c.close).slice(-28),
        high: candles.map((c) => c.high).slice(-28),
        low: candles.map((c) => c.low).slice(-28),
      }).slice(-1)[0].adx
    : null;

  // Awesome Indicator
  const ao = NEURAL_NETWORK_INDICATORS_INPUTS.AO
    ? AwesomeOscillator.calculate({
        fastPeriod: 5,
        slowPeriod: 25,
        high: candles.map((c) => c.high).slice(-26),
        low: candles.map((c) => c.low).slice(-26),
      }).slice(-1)[0]
    : null;

  // Commodity Channel Index
  const cci = NEURAL_NETWORK_INDICATORS_INPUTS.CCI
    ? CCI.calculate({
        period: 20,
        close: candles.map((c) => c.close).slice(-21),
        high: candles.map((c) => c.high).slice(-21),
        low: candles.map((c) => c.low).slice(-21),
      }).slice(-1)[0]
    : null;

  // Money Flow Index
  const mfi = NEURAL_NETWORK_INDICATORS_INPUTS.MFI
    ? MFI.calculate({
        period: 14,
        volume: candles.map((c) => c.volume).slice(-15),
        close: candles.map((c) => c.close).slice(-15),
        high: candles.map((c) => c.high).slice(-15),
        low: candles.map((c) => c.low).slice(-15),
      }).slice(-1)[0]
    : null;

  // Rate of Change
  const roc = NEURAL_NETWORK_INDICATORS_INPUTS.ROC
    ? ROC.calculate({
        period: 9,
        values: candles.map((c) => c.close).slice(-10),
      }).slice(-1)[0]
    : null;

  // Relative Strengh Index
  const rsi = NEURAL_NETWORK_INDICATORS_INPUTS.RSI
    ? RSI.calculate({
        period: 14,
        values: candles.map((c) => c.close).slice(-15),
      }).slice(-1)[0]
    : null;

  // William R
  const williamR = NEURAL_NETWORK_INDICATORS_INPUTS.WILLIAM_R
    ? WilliamsR.calculate({
        period: 14,
        close: candles.map((c) => c.close).slice(-15),
        high: candles.map((c) => c.high).slice(-15),
        low: candles.map((c) => c.low).slice(-15),
      }).slice(-1)[0]
    : null;

  // Ichimoku
  const kijun = NEURAL_NETWORK_INDICATORS_INPUTS.KIJUN
    ? IchimokuCloud.calculate({
        conversionPeriod: 9,
        basePeriod: 26,
        spanPeriod: 52,
        displacement: 26,
        high: candles.map((c) => c.high).slice(-53),
        low: candles.map((c) => c.low).slice(-53),
      }).slice(-1)[0].base
    : null;

  // Volume Weighted Average Price
  const vwap = NEURAL_NETWORK_INDICATORS_INPUTS.VWAP
    ? VWAP.calculate({
        close: [candles[candles.length - 1].close],
        high: [candles[candles.length - 1].high],
        low: [candles[candles.length - 1].low],
        volume: [candles[candles.length - 1].volume],
      }).slice(-1)[0]
    : null;

  // Oscillator volume
  const volOsc = NEURAL_NETWORK_INDICATORS_INPUTS.VOL_OSC
    ? VolumeOscillator.calculate({
        shortLength: 5,
        longLength: 10,
        candles: candles.slice(-11),
      }).slice(-1)[0]
    : null;

  // Trading volume
  const vol = NEURAL_NETWORK_INDICATORS_INPUTS.VOL
    ? candles[candles.length - 1].volume
    : null;

  // Price change
  const currentPrice = candles[candles.length - 1].close;
  const olderPrice = candles[candles.length - 10].close;
  const priceChange = NEURAL_NETWORK_INDICATORS_INPUTS.PRICE_CHANGE
    ? (currentPrice - olderPrice) / olderPrice
    : null;

  // Inputs for the neural network
  let inputs = [
    ema21,
    ema50,
    ema100,
    adx,
    ao,
    cci,
    mfi,
    roc,
    rsi,
    williamR,
    vwap,
    kijun,
    volOsc,
    vol,
    priceChange,
  ].filter((i) => i !== null);

  return inputs;
}

/**
 * To print a value with a color code (green when it's positive, red if it's negative)
 * @param value
 * @param pivotValue
 * @param addPercentageSymbol- Add a % symbol next to the value
 */
function coloredValue(
  value: number,
  pivotValue = 0,
  addPercentageSymbol = false
) {
  if (value >= pivotValue) {
    return chalk.greenBright(
      value.toString().concat(addPercentageSymbol ? '%' : '')
    );
  } else {
    return chalk.redBright(
      value.toString().concat(addPercentageSymbol ? '%' : '')
    );
  }
}

/**
 * Display stats of the best trader
 * @param bestTrader
 */
function displayBestTraderStats(bestTrader: Trader) {
  let {
    score,
    wallet,
    stats: {
      totalProfit,
      totalLoss,
      totalFees,
      winningTrades,
      totalTrades,
      longWinningTrades,
      shortWinningTrades,
      longLostTrades,
      shortLostTrades,
      maxRelativeDrawdown,
    },
  } = bestTrader;

  score = decimalFloor(score, 2);
  totalProfit = decimalFloor(totalProfit, 2);
  totalLoss = decimalFloor(Math.abs(totalLoss), 2);
  totalFees = decimalFloor(Math.abs(totalFees), 2);
  let profitRatio = decimalFloor(totalProfit / (totalLoss + totalFees), 2);
  let totalBalance = decimalFloor(wallet.totalWalletBalance, 2);
  let winRate = decimalFloor((winningTrades / totalTrades) * 100, 2);
  let roi = decimalFloor(
    ((wallet.totalWalletBalance - initialCapital) * 100) / initialCapital,
    2
  );
  let maxRelDrawdown = decimalCeil(maxRelativeDrawdown * 100, 2);
  let totalWinningTrades = longWinningTrades + shortWinningTrades;
  let totalLostTrades = longLostTrades + shortLostTrades;
  let averageProfit = decimalFloor(totalProfit / totalWinningTrades, 2);
  let averageLoss = decimalFloor(totalLoss / totalLostTrades, 2);

  console.log(`------------ Best Trader ------------`);
  console.log(`Score: ${coloredValue(score)}`);
  console.log(`ROI: ${coloredValue(roi, 0, true)}`);
  console.log(`Balance: ${coloredValue(totalBalance, initialCapital)}`);
  console.log(`Trades: ${totalTrades}`);
  console.log(`Trades won: ${totalWinningTrades}`);
  console.log(`Trades lost: ${totalLostTrades}`);
  console.log(
    `Max Relative Drawdown: ${coloredValue(maxRelDrawdown, 1, true)}`
  );
  console.log(`Win rate: ${coloredValue(winRate, 50, true)}`);
  console.log(`Longs: ${longWinningTrades + longLostTrades}`);
  console.log(`Shorts: ${shortWinningTrades + shortLostTrades}`);
  console.log(
    `Profit Ratio: ${coloredValue(isNaN(profitRatio) ? 0 : profitRatio, 1)}`
  );
  console.log(`Total Profit: ${coloredValue(totalProfit, 0)}`);
  console.log(`Total Loss: ${coloredValue(-totalLoss, 0)}`);
  console.log(`Total Fees: ${coloredValue(-totalFees, 0)}`);
  console.log(
    `Average profit: ${coloredValue(
      isNaN(averageProfit) ? 0 : averageProfit,
      0
    )}`
  );
  console.log(
    `Average loss: ${coloredValue(isNaN(-averageLoss) ? 0 : -averageLoss, 0)}`
  );
  console.log(`-------------------------------------`);
  console.log(``);
}

/**
 * Train the traders to get the best
 */
export async function train() {
  const binanceClient = Binance({
    apiKey: process.env.BINANCE_PUBLIC_KEY,
    apiSecret: process.env.BINANCE_PRIVATE_KEY,
  });

  const exchangeInfo = await binanceClient.futuresExchangeInfo();

  if (Config.length > 1) {
    console.error('You can use only one config in the genetic optimization.');
    return;
  }
  if (Config.length === 0) {
    console.error('No config has been found.');
    return;
  }

  const tradeConfig = Config[0];

  const historicCandleData = await loadCandlesFromCSV(
    tradeConfig.asset + tradeConfig.base,
    tradeConfig.loopInterval,
    startDateTraining,
    endDateTraining
  );

  let population = new Population(
    totalPopulation,
    tradeConfig.exitStrategy
      ? NEURAL_NETWORK_INPUTS
      : NEURAL_NETWORK_INPUTS + 1, // If no strategy to exit, add an input to know if the player have a position opened
    tradeConfig.exitStrategy
      ? NEURAL_NETWORK_OUTPUTS
      : NEURAL_NETWORK_OUTPUTS + 1, // If no strategy to exit, add an output to close the position
    {
      tradeConfig,
      binanceClient,
      exchangeInfo,
      initialCapital,
      goals: {
        winRate: winRate,
        profitRatio: profitRatio,
        maxRelativeDrawdown: maxRelativeDrawdown,
      },
    }
  );

  for (let gen = 0; gen < totalGenerations; gen++) {
    for (let i = 0; i < historicCandleData.length; i++) {
      const minimalLength = 150;
      if (i < minimalLength) continue;

      let candles = historicCandleData.slice(
        i - minimalLength < 0 ? 0 : i - minimalLength,
        i
      );
      let currentPrice = candles[candles.length - 1].close;
      let indicatorsInputs = calculateIndicators(candles);

      if (!population.done() && i < historicCandleData.length - 1) {
        // if any players are alive then update them
        population.updateAlive(
          tradeConfig,
          candles,
          currentPrice,
          indicatorsInputs
        );
      } else {
        // genetic algorithm
        population.naturalSelection();
      }
    }

    console.log(
      `============================== Generation ${gen} ==============================`
    );

    console.log(
      `Average Fitness: ${coloredValue(
        population.getAvgFitnessSum() / population.species.length,
        0
      )}\n`
    );

    let bestTrader = population.bestPlayer;
    displayBestTraderStats(bestTrader);
  }
}

train();
