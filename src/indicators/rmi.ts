import { EMA } from 'technicalindicators';

interface Options {
  values: number[];
  length: number;
  momentum: number;
}

const defaultOptions = {
  length: 33,
  momentum: 15,
};

export function calculate({
  values,
  length = defaultOptions.length,
  momentum = defaultOptions.momentum,
}: Options) {
  let diff1 = [];
  let diff2 = [];
  for (let i = momentum; i < values.length; i++) {
    diff1.push(Math.max(values[i] - values[i - momentum], 0));
    diff2.push(Math.max(values[i - momentum] - values[i], 0));
  }

  let up = EMA.calculate({ period: length, values: diff1 });
  let down = EMA.calculate({ period: length, values: diff2 });

  let rmi = [];
  for (let i = 0; i < values.length - momentum - length + 1; i++) {
    rmi.push(down[i] === 0 ? 0 : 100 - 100 / (1 + up[i] / down[i]));
  }

  return rmi;
}
