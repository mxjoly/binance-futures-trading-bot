import { train } from './train';

// if true, reset the neural network save
const RESET = process.argv[2]
  ? process.argv[2].split('=')[1] === 'true'
    ? true
    : false
  : false;

train(RESET);
