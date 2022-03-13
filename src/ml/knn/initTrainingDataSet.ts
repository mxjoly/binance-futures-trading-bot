import { tensor } from '@tensorflow/tfjs-core';
import { calculateIndicators } from './indicators';
import { PREDICTION_PERIOD, PRICE_CHANGE } from './loadConfig';

export async function initTrainingDataSet(candles: CandleData[]) {
  // Add indicator values to our data set
  const indicators = calculateIndicators(candles);

  const dataSet: DataSet = [];

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

    dataSet.push({ features, target });
  }

  return dataSet;
}
