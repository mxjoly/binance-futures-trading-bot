import { train } from '.';

// Use save file of the previous neural network
const useSave = process.argv[2]
  ? process.argv[2].split('=')[1] === 'true'
    ? true
    : false
  : false;

train(useSave);
