import colors from 'ansi-colors';
import cliProgress from 'cli-progress';
import Binance from 'binance-api-node';
import Trader from './trader';
import { BotConfig } from '../init';
import { loadCandlesFromCSV } from '../utils/candleData';
import { StrategyConfig } from './config';
import { loadNeuralNetwork, saveNeuralNetwork } from './saveManager';
import { generate, normalizeFitness } from './neat';
import { NeuralNetwork } from '../lib/neuralNetwork';
import { EMA } from 'technicalindicators';
import { decimalFloor } from '../utils/math';

// ===================================================================================================

const NeatConfig = BotConfig['neat'];
const totalPopulation = NeatConfig['total_population'];
const totalGenerations = NeatConfig['total_generations'];
const initialCapital = NeatConfig['initial_capital'];
const startDateTraining = NeatConfig['start_date_training'];
const endDateTraining = NeatConfig['end_date_training'];

// ===================================================================================================

function createProgressBar() {
  return new cliProgress.SingleBar(
    {
      format:
        'Progress: |' +
        colors.blue('{bar}') +
        '| {percentage}% | generation: {generation}',
    },
    cliProgress.Presets.shades_classic
  );
}

// ===================================================================================================

async function training(reset?: boolean) {
  const binanceClient = Binance({
    apiKey: process.env.BINANCE_PUBLIC_KEY,
    apiSecret: process.env.BINANCE_PRIVATE_KEY,
  });

  const exchangeInfo = await binanceClient.futuresExchangeInfo();

  const candles = await loadCandlesFromCSV(
    StrategyConfig.asset + StrategyConfig.base,
    StrategyConfig.loopInterval,
    startDateTraining,
    endDateTraining
  );

  let activeTraders: Trader[] = [];
  let allTraders: Trader[] = [];
  let highScore: number = -Infinity; // All time high score
  let bestTrader: Trader = null; // All time best trader

  for (let n = 0; n < totalGenerations; n++) {
    const bar = createProgressBar();
    bar.start(totalPopulation, 0);

    // Try to load a network save
    let brain = loadNeuralNetwork();

    // Create the population
    for (let i = 0; i < totalPopulation; i++) {
      let bot = new Trader(
        StrategyConfig,
        candles,
        binanceClient,
        exchangeInfo,
        initialCapital,
        reset ? null : brain
      );
      activeTraders[i] = bot;
      allTraders[i] = bot;
    }

    for (let i = 0; i < activeTraders.length; i++) {
      activeTraders[i].run();
      bar.increment(1, { generation: n });
    }

    bar.stop();

    // Which is the best trader?
    let tempHighScore = -Infinity;
    let tempBestTrader: Trader = null;
    for (let i = 0; i < activeTraders.length; i++) {
      let score = activeTraders[i].score;
      if (score > tempHighScore) {
        tempHighScore = score;
        tempBestTrader = activeTraders[i];
      }
    }

    // Is it the all time high score ?
    if (tempHighScore > highScore) {
      highScore = tempHighScore;
      bestTrader = tempBestTrader;
      saveNeuralNetwork(bestTrader.brain);
    }

    let totalProfit = decimalFloor(bestTrader.totalProfit, 2);
    let totalLoss = decimalFloor(Math.abs(bestTrader.totalLoss), 2);
    let profitRatio = decimalFloor(totalProfit / totalLoss, 2);
    let totalBalance = decimalFloor(bestTrader.wallet.totalWalletBalance, 2);
    let score = decimalFloor(bestTrader.score, 2);

    console.log(`------------ Best Trader ------------`);
    console.log(`Score: ${score}`);
    console.log(`Total Balance: ${totalBalance}`);
    console.log(`Trades: ${bestTrader.numberTrades}`);
    console.log(`Profit Ratio: ${profitRatio}`);
    console.log(`Total Profit: ${totalProfit}`);
    console.log(`Total Loss: -${totalLoss}`);
    console.log(`-------------------------------------`);
    console.log(``);

    // If we're out of traders go to the next generation
    if (activeTraders.length == 0) {
      activeTraders = [];
      // Normalize the fitness values 0-1
      normalizeFitness(allTraders);
      // Generate a new set of traders
      activeTraders = generate(allTraders);
      // Copy those traders to another array
      allTraders = activeTraders.slice();
    }
  }
}

// Reset mode ?
export const RESET = process.argv[2]
  ? process.argv[2].split('=')[1] === 'true'
    ? true
    : false
  : false;

training(RESET);

// ======================================================================================== //
// =================================== NEURAL NETWORK ===================================== //
// ======================================================================================== //

/**
 * Calculate the inputs for the neural network
 * @param pair
 * @param candles
 * @param extra
 */
export function getInputs(
  pair: string,
  candles: CandleData[],
  extra: { wallet?: Wallet; futuresWallet?: FuturesWallet }
) {
  // EMA
  const emaValues = EMA.calculate({
    period: 21,
    values: candles
      .map((c) => c.close)
      .slice(candles.length - 21, candles.length),
  });
  const emaValue = emaValues[emaValues.length - 1];

  // Price diff
  const currentPrice = candles[candles.length - 1].close;
  const olderPrice = candles[candles.length - 10].close;
  const changePercent = (currentPrice - olderPrice) / olderPrice;

  // Trading volume
  const tradingVolume = candles[candles.length - 1].volume;

  // Currently holding a trade/position?
  let holdingTrade = false;
  if (extra.wallet) {
    const balance = extra.wallet.balances.find((bal) => bal.symbol === pair);
    holdingTrade = balance.quantity > 0;
  }
  if (extra.futuresWallet) {
    const position = extra.futuresWallet.positions.find(
      (pos) => pos.pair === pair
    );
    holdingTrade = position.size !== 0;
  }

  // Inputs for the neural network
  let inputs = [emaValue, changePercent, tradingVolume, holdingTrade ? 1 : 0];

  return inputs;
}

/**
 * Function to get the outputs of the neural network according to the inputs
 * @param pair
 * @param candles
 * @param brain
 * @param extra
 */
export function getOutputs(
  pair: string,
  candles: CandleData[],
  brain: NeuralNetwork,
  extra: { wallet?: Wallet; futuresWallet?: FuturesWallet }
) {
  // Get the inputs
  let inputs = getInputs(pair, candles, extra);

  // Get the outputs from the network
  let action = brain.predict(inputs);

  let max = Math.max(...action);
  if (max > 0.8) {
    // Decide to buy, sell or close the current position!
    if (max === action[0]) return 'BUY';
    if (max === action[1]) return 'SELL';
    if (max === action[2]) return 'CLOSE';
  }
}
