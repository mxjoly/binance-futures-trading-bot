import fs from 'fs';
import path from 'path';

const tempDirectory = path.resolve(process.cwd(), 'temp');
const saveFile = path.join(tempDirectory, 'dataset-save.json');

/**
 * Save the dataset in a json file
 */
export function saveDataSet(dataSet: DataSet, file?: string) {
  if (!fs.existsSync(tempDirectory)) fs.mkdirSync(tempDirectory);

  let content = `{ "dataset": [${dataSet.map(
    ({ features, target }) =>
      `{ "features": [${features.toString()}], "target": ${target}}`
  )}]}`;

  fs.writeFileSync(file ? path.join(tempDirectory, file) : saveFile, content);
  console.log(`The dataset has been saved successfully`);
}

/**
 * Load the dataset from a save file
 */
export function loadDataSet(): {
  dataset: { features: number[]; target: number }[];
} {
  if (fs.existsSync(saveFile)) {
    let data = require(saveFile);
    console.log(`The dataset has been loaded successfully`);
    return data;
  } else {
    console.error(`No dataset to load`);
    return null;
  }
}
