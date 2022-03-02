import { randomIntFromInterval } from '../utils/math';
import Trader from './trader';

/**
 * Generate a new population of traders
 * @param oldTraders
 */
export function generate(oldTraders: Trader[]) {
  let newTraders = [];
  for (let i = 0; i < oldTraders.length; i++) {
    // Select a trader based on fitness
    let trader = select(oldTraders);
    newTraders[i] = trader;
  }
  return newTraders;
}

/**
 * Normalize the fitness of all traders
 * @param traders
 */
export function normalizeFitness(traders: Trader[]) {
  // Make score exponentially better?
  for (let i = 0; i < traders.length; i++) {
    traders[i].score = Math.pow(traders[i].score, 2);
  }

  // Add up all the scores
  let sum = 0;
  for (let i = 0; i < traders.length; i++) {
    sum += traders[i].score;
  }

  // Divide by the sum
  for (let i = 0; i < traders.length; i++) {
    traders[i].fitness = traders[i].fitness / sum;
  }
}

/**
 * An algorithm for picking one trader from an array based on fitness
 * @param traders
 */
export function select(traders: Trader[]) {
  let fitnessSum = 0;
  for (let i = 0; i < traders.length; i++) {
    fitnessSum += traders[i].fitness;
  }

  let rand = randomIntFromInterval(0, fitnessSum);
  let runningSum = 0;

  for (let i = 0; i < traders.length; i++) {
    runningSum += traders[i].fitness;
    if (runningSum > rand) {
      return traders[i].copy();
    }
  }
}
