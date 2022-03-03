import colors from 'ansi-colors';
import cliProgress from 'cli-progress';
import Binance from 'binance-api-node';
import Trader from './trader';
import { BotConfig } from '../init';
import { loadCandlesFromCSV } from '../utils/candleData';
import Config from '../configs/genetic';
import { loadNeuralNetwork, saveNeuralNetwork } from './saveManager';
import { generate, normalizeFitness } from './neat';
import { decimalFloor } from '../utils/math';

// ===================================================================================================

const GeneticConfig = BotConfig['genetic'];
const totalPopulation = GeneticConfig['population'];
const totalGenerations = GeneticConfig['generations'];
const initialCapital = GeneticConfig['initial_capital'];
const startDateTraining = GeneticConfig['start_date_training'];
const endDateTraining = GeneticConfig['end_date_training'];
const startDateTest = GeneticConfig['start_date_test'];
const endDateTest = GeneticConfig['end_date_test'];

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

function displayBestTraderStats(bestTrader: Trader) {
  let {
    score,
    totalProfit,
    totalLoss,
    totalFees,
    wallet,
    totalWinningTrades,
    numberTrades,
  } = bestTrader;

  score = decimalFloor(score, 2);
  totalProfit = decimalFloor(totalProfit, 2);
  totalLoss = decimalFloor(Math.abs(totalLoss), 2);
  totalFees = decimalFloor(Math.abs(bestTrader.totalFees), 2);
  let profitRatio = decimalFloor(totalProfit / (totalLoss + totalFees), 2);
  let totalBalance = decimalFloor(wallet.totalWalletBalance, 2);
  let winRate = decimalFloor((totalWinningTrades / numberTrades) * 100, 2);
  let roi = decimalFloor(
    ((wallet.totalWalletBalance - initialCapital) * 100) / initialCapital,
    2
  );

  console.log(`------------ Best Trader ------------`);
  console.log(`Score: ${score}`);
  console.log(`ROI: ${roi}%`);
  console.log(`Balance: ${totalBalance}`);
  console.log(`Trades: ${numberTrades}`);
  console.log(`Win rate: ${winRate}%`);
  console.log(`Profit Ratio: ${profitRatio}`);
  console.log(`Total Profit: ${totalProfit}`);
  console.log(`Total Loss: -${totalLoss}`);
  console.log(`Total Fees: -${totalFees}`);
  console.log(`-------------------------------------`);
  console.log(``);
}

/**
 * Train the trader to get the best genomes
 * @param reset Reset the last neural network ?
 */
export async function train(reset?: boolean) {
  const binanceClient = Binance({
    apiKey: process.env.BINANCE_PUBLIC_KEY,
    apiSecret: process.env.BINANCE_PRIVATE_KEY,
  });

  const exchangeInfo = await binanceClient.futuresExchangeInfo();

  const candles = await loadCandlesFromCSV(
    Config[0].asset + Config[0].base,
    Config[0].loopInterval,
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
        Config[0],
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

    displayBestTraderStats(bestTrader);

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
