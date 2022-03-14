import { tensor } from '@tensorflow/tfjs-core';
import { calculateIndicators } from './indicators';
import { PREDICTION_PERIOD, PRICE_CHANGE } from './loadConfig';
import { loadDataSet, saveDataSet } from './saveManager';

export async function initTrainingDataSet(
  candles: CandleData[],
  useSave = false
) {
  const dataSet: DataSet = [];

  // Try to load an existing dataset saved
  let savedDataSet = loadDataSet();

  if (useSave && savedDataSet) {
    // Convert the features in tensors
    savedDataSet.dataset.forEach(({ features, target }) => {
      dataSet.push({ features: tensor(features), target });
    });
  } else {
    // Add indicator values to our data set
    const indicators = calculateIndicators(candles);

    const dataSetToSave: { features: number[]; target: number }[] = [];

    for (
      let i = candles.length - indicators[0].length, j = 0;
      i + PREDICTION_PERIOD < candles.length;
      i++, j++
    ) {
      const currentCandle = candles[i];
      const futureCandle = candles[i + PREDICTION_PERIOD];

      const priceChange =
        (futureCandle.close - currentCandle.close) / currentCandle.close;

      // Classes : [1: Buy] [0: Wait] [-1: Sell]
      const target =
        priceChange > PRICE_CHANGE ? 1 : priceChange < -PRICE_CHANGE ? -1 : 0;

      const features = tensor(indicators.map((ind) => ind[j]));

      dataSetToSave.push({ features: indicators.map((ind) => ind[j]), target });
      dataSet.push({ features, target });
    }

    saveDataSet(dataSetToSave);
  }
  return dataSet;
}
