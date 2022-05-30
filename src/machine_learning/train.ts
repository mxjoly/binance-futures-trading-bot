import path from 'path';
import fs from 'fs';
import * as tf from '@tensorflow/tfjs-node';
import { CandleChartInterval } from 'binance-api-node';
import { loadCandlesFromCSV } from '../utils/loadCandleData';
import { normalize } from '../utils/math';

/**
 * @param data
 * @param n - Number of candles needed to make a prediction
 */
async function createDataset(data: number[], n: number) {
  // Normalize the data between 0 and 1
  let max = Math.max(...data);
  let min = Math.min(...data);
  let normalizedData = data.map((v) => normalize(v, min, max, 0, 1));

  let X = [];
  let Y = [];

  // Build the dataset
  for (let i = n; i < normalizedData.length; i += n) {
    let l = [];
    for (let j = i - n; j < i - 1; j++) {
      l.push(normalizedData[j]);
    }
    X.push(l);
    Y.push(normalizedData[i + 1]);
  }

  // Return the tensors
  return { X: tf.tensor(X), Y: tf.expandDims(tf.tensor(Y), 1) };
}

function createModel(inputShape: [number, number]) {
  // Creating model
  const model = tf.sequential();

  model.add(
    tf.layers.lstm({
      units: 96,
      returnSequences: true,
      inputShape,
    })
  );
  model.add(tf.layers.dropout({ rate: 0.2 }));
  model.add(tf.layers.lstm({ units: 96, returnSequences: true }));
  model.add(tf.layers.dropout({ rate: 0.2 }));
  model.add(tf.layers.lstm({ units: 96, returnSequences: false }));
  model.add(tf.layers.dropout({ rate: 0.2 }));
  model.add(tf.layers.dense({ units: 1 }));

  return model;
}

async function trainModel() {
  // Load the data from historic
  const data = (
    await loadCandlesFromCSV(
      'BTCUSDT',
      CandleChartInterval.ONE_HOUR,
      '2020-01-01 00:00:00',
      '2022-01-01 00:00:00'
    )
  ).map((c) => c.close);

  // Create the dataset
  let { X, Y } = await createDataset(data, 10);

  // Reshape input to be [samples, time steps, features] which is required for LSTM
  X = X.reshape([X.shape[0], X.shape[1], 1]);

  // Creating model
  const model = createModel([X.shape[1], 1]);

  model.compile({
    optimizer: tf.train.adam(),
    loss: tf.losses.meanSquaredError,
  });

  // Display summary
  model.summary();

  // Train the model
  await model.fit(X, Y, { epochs: 200 });

  // Save the model
  const directory = path.join(process.cwd(), 'temp');
  const filename = path.join(directory, 'model.json');
  if (!fs.existsSync(directory)) fs.mkdirSync(directory);
  await model.save(`file://${filename}`).then(() => {
    console.log(`Model saved successfully`);
  });
}

trainModel();
