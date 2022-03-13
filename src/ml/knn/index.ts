import { tensor } from '@tensorflow/tfjs-core';
import { KNNClassifier } from '@tensorflow-models/knn-classifier';
import { loadCandlesFromCSV } from '../../utils/loadCandleData';
import { initTrainingDataSet } from './initDataSet';
import { calculateIndicators } from './indicators';
import { decimalFloor } from '../../utils/math';
import {
  endDateTest,
  endDateTraining,
  PREDICTION_PERIOD,
  PREDICTION_THRESHOLD,
  PRICE_CHANGE,
  startDateTraining,
  StrategyConfig,
} from './loadConfig';
import { startDateTest } from '../neat/loadConfig';

/**
 * Give to the classifier a bunch of examples
 */
export async function trainClassifier(classifier: KNNClassifier) {
  const { base, asset, loopInterval } = StrategyConfig;

  // Init the candle data
  const candles = await loadCandlesFromCSV(
    asset + base,
    loopInterval,
    startDateTraining,
    endDateTraining
  );

  // Init the data set
  const dataSet = await initTrainingDataSet(candles);

  // Add the data set to classifier
  dataSet.forEach((data) => classifier.addExample(data.features, data.target));

  // Log
  console.log(`The data set has been loaded successfully`);
}

/**
 * Test the classifier on the period of test to evaluate its accuracy
 */
export async function testClassifier(classifier: KNNClassifier) {
  const { base, asset, loopInterval } = StrategyConfig;

  // Init the candle data
  const candles = await loadCandlesFromCSV(
    asset + base,
    loopInterval,
    startDateTest,
    endDateTest
  );

  const indicators = calculateIndicators(candles);

  let makePredictions: Promise<boolean | null>[] = [];

  for (
    let i = candles.length - indicators[0].length, j = 0;
    i + PREDICTION_PERIOD < candles.length;
    i++, j++
  ) {
    makePredictions.push(
      new Promise<boolean | null>((resolve, reject) => {
        const currentCandle = candles[i];
        const futureCandle = candles[i + PREDICTION_PERIOD];

        const priceChange =
          (futureCandle.close - currentCandle.close) / currentCandle.close;

        const expectedTarget =
          priceChange > PRICE_CHANGE ? 1 : priceChange < -PRICE_CHANGE ? -1 : 0;

        const features = tensor(indicators.map((ind) => ind[j]));

        classifier
          .predictClass(features)
          .then(({ label, confidences }) => {
            // Take only the best predictions
            if (confidences[label] > PREDICTION_THRESHOLD)
              resolve(Number(label) === expectedTarget);
            else resolve(null);
          })
          .catch(reject);
      })
    );
  }

  Promise.all(makePredictions).then((predictionResults) => {
    const totalPredictions = predictionResults.filter(
      (pred) => pred !== null
    ).length;

    const goodPredictions = predictionResults.filter(
      (pred) => pred === true
    ).length;

    const accuracy = decimalFloor(
      (goodPredictions / totalPredictions) * 100,
      2
    );

    console.log(
      `The classifier predicts the price movement (+/- ${PRICE_CHANGE}%) on ${
        asset + base
      } with an accuracy of: ${accuracy}% (${goodPredictions}/${totalPredictions})`
    );
  });
}
