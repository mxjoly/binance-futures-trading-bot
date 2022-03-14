import { tensor } from '@tensorflow/tfjs-core';
import { KNNClassifier } from '@tensorflow-models/knn-classifier';
import { loadCandlesFromCSV } from '../../utils/loadCandleData';
import { initTrainingDataSet } from './initTrainingDataSet';
import { calculateIndicators } from './indicators';
import { decimalFloor } from '../../utils/math';
import {
  startDateTest,
  endDateTest,
  endDateTraining,
  PREDICTION_PERIOD,
  PREDICTION_THRESHOLD,
  PRICE_CHANGE,
  startDateTraining,
  StrategyConfig,
} from './loadConfig';

/**
 * Give to the classifier a bunch of examples
 * @param classifier
 * @param useSave Save the data set
 */
export async function trainClassifier(
  classifier: KNNClassifier,
  useSave = true
) {
  const { base, asset, loopInterval } = StrategyConfig;

  // Init the candle data
  const candles = await loadCandlesFromCSV(
    asset + base,
    loopInterval,
    startDateTraining,
    endDateTraining
  );

  // Init the data set
  const dataSet = await initTrainingDataSet(candles, useSave);

  // Add the data set to classifier
  dataSet.forEach((data) => classifier.addExample(data.features, data.target));

  return classifier;
}

/**
 * Test the classifier on the period of test to evaluate its accuracy
 * @param classifier
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

  let makePredictions: Promise<{
    results: PredictionResults;
    expectedLabel: string;
  }>[] = [];

  for (
    let i = candles.length - indicators[0].length, j = 0;
    i + PREDICTION_PERIOD < candles.length;
    i++, j++
  ) {
    makePredictions.push(
      new Promise<{ results: PredictionResults; expectedLabel: string }>(
        (resolve, reject) => {
          const currentCandle = candles[i];
          const futureCandle = candles[i + PREDICTION_PERIOD];

          const priceChange =
            (futureCandle.close - currentCandle.close) / currentCandle.close;

          const expectedLabel =
            priceChange > PRICE_CHANGE
              ? 1
              : priceChange < -PRICE_CHANGE
              ? -1
              : 0;

          const features = tensor(indicators.map((ind) => ind[j]));

          classifier
            .predictClass(features)
            .then((prediction) => {
              resolve({
                results: prediction,
                expectedLabel: String(expectedLabel),
              });
            })
            .catch(reject);
        }
      )
    );
  }

  Promise.all(makePredictions).then((predictions) => {
    const totalPredictionsByLabel = { '-1': 0, '0': 0, '1': 0 };
    const goodPredictionsByLabel = { '-1': 0, '0': 0, '1': 0 };

    predictions.forEach(({ results, expectedLabel }) => {
      const { label, confidences } = results;
      if (confidences[label] > PREDICTION_THRESHOLD) {
        totalPredictionsByLabel[label]++;
        if (label === expectedLabel) goodPredictionsByLabel[label]++;
      }
    });

    Object.entries(totalPredictionsByLabel).forEach(([label, value]) => {
      const accuracy = decimalFloor(
        (goodPredictionsByLabel[label] / value) * 100,
        2
      );
      console.log(
        `${label} => ${accuracy}% (${goodPredictionsByLabel[label]}/${value})`
      );
    });
  });
}
