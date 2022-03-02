import fs from 'fs';
import path from 'path';
import { NeuralNetwork } from '../lib/neuralNetwork';

const tempDirectory = path.resolve(process.cwd(), 'temp');
const saveFile = path.join(tempDirectory, 'nn-save.json');

/**
 * Save the neural network in a txt file
 * @param nn The neural network
 */
export function saveNeuralNetwork(nn: NeuralNetwork) {
  if (!fs.existsSync(tempDirectory)) fs.mkdirSync(tempDirectory);
  fs.writeFileSync(saveFile, nn.serialize());
}

/**
 * Load the neural network from a save file
 */
export function loadNeuralNetwork() {
  if (fs.existsSync(saveFile)) {
    let data = fs.readFileSync(saveFile, 'utf-8');
    return NeuralNetwork.deserialize(data);
  } else {
    return null;
  }
}
