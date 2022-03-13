import chalk from 'chalk';
import Binance from 'binance-api-node';

import { loadCandlesFromCSV } from '../../utils/loadCandleData';
import Trader from './core/player';
import Config from '../../configs/neat';
import { decimalCeil, decimalFloor } from '../../utils/math';
import Population from './core/population';
import { loadNeuralNetwork, saveNeuralNetwork } from './saveManager';
import {
  CANDLE_LENGTH_INPUTS,
  NEURAL_NETWORK_INPUTS_MODE,
  NEURAL_NETWORK_INDICATORS_INPUTS,
  startDateTraining,
  endDateTraining,
  totalGenerations,
  totalPopulation,
  initialCapital,
  winRate,
  profitRatio,
  maxRelativeDrawdown,
} from './loadConfig';

// ===================================================================================================

const NEURAL_NETWORK_INPUTS =
  NEURAL_NETWORK_INPUTS_MODE === 'candles'
    ? CANDLE_LENGTH_INPUTS
    : Object.entries(NEURAL_NETWORK_INDICATORS_INPUTS).filter(
        ([, val]) => val === true
      ).length;

const NEURAL_NETWORK_OUTPUTS = 2; // Buy / Sell

export const CANDLE_MIN_LENGTH = 150; // the trader start to trade when it can see X candles

// ===================================================================================================

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
    bestScore,
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

  bestScore = decimalFloor(bestScore, 2);
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

  console.log(`------------ Best Trader Ever ------------`);
  console.log(`Score: ${coloredValue(bestScore)}`);
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
export async function train(useSave?: boolean) {
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

  let goals = {
    winRate: winRate,
    profitRatio: profitRatio,
    maxRelativeDrawdown: maxRelativeDrawdown,
  };

  let population = new Population({
    size: totalPopulation,
    player: {
      genomeInputs: tradeConfig.exitStrategy
        ? NEURAL_NETWORK_INPUTS
        : NEURAL_NETWORK_INPUTS + 1, // If no strategy to exit, add an input to know if the player have a position opened
      genomeOutputs: tradeConfig.exitStrategy
        ? NEURAL_NETWORK_OUTPUTS
        : NEURAL_NETWORK_OUTPUTS + 1, // If no strategy to exit, add an output to close the position
      tradeConfig,
      binanceClient,
      exchangeInfo,
      initialCapital,
      goals,
      brain: useSave ? loadNeuralNetwork() : null,
    },
  });

  for (let gen = 0; gen < totalGenerations; gen++) {
    for (let i = 0; i < historicCandleData.length; i++) {
      if (i < CANDLE_MIN_LENGTH) continue;

      let candles = historicCandleData.slice(
        i - CANDLE_MIN_LENGTH < 0 ? 0 : i - CANDLE_MIN_LENGTH,
        i
      );
      let currentPrice = candles[candles.length - 1].close;

      if (!population.done() && i < historicCandleData.length - 1) {
        // if any players are alive then update them
        population.updateAlive(tradeConfig, candles, currentPrice);
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
      )}`
    );

    let bestTrader = population.bestPlayer;
    displayBestTraderStats(bestTrader);

    saveNeuralNetwork(population.bestPlayer.brain);
  }
}
