import fs from 'fs';
import path from 'path';
import Genome from './core/genome';

const tempDirectory = path.resolve(process.cwd(), 'temp');
const saveFile = path.join(tempDirectory, 'neat-nn-save.json');

/**
 * Save the neural network in a txt file
 * @param genome The neural network
 */
export function saveNeuralNetwork(genome: Genome, file?: string) {
  if (!fs.existsSync(tempDirectory)) fs.mkdirSync(tempDirectory);
  fs.writeFileSync(
    file ? path.join(tempDirectory, file) : saveFile,
    genome.serialize()
  );
}

/**
 * Load the neural network from a save file
 */
export function loadNeuralNetwork() {
  if (fs.existsSync(saveFile)) {
    let data = fs.readFileSync(saveFile, 'utf-8');
    return Genome.deserialize(data);
  } else {
    return null;
  }
}
