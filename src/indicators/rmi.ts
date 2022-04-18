import { EMA } from 'technicalindicators';

interface Options {
  length: number;
  momentum: number;
  sourceType: 'close' | 'open' | 'high' | 'low';
}

const defaultOptions: Options = {
  length: 33,
  momentum: 15,
  sourceType: 'close',
};

export function calculate(candles: CandleData[], options = defaultOptions) {
  let sources = candles.map((c) => {
    switch (options.sourceType) {
      case 'close':
        return c.close;
      case 'open':
        return c.open;
      case 'high':
        return c.high;
      case 'low':
        return c.low;
      default:
        return c.close;
    }
  });

  let diff1 = [];
  let diff2 = [];
  for (let i = options.momentum; i < candles.length; i++) {
    diff1.push(Math.max(sources[i] - sources[i - options.momentum], 0));
    diff2.push(Math.max(sources[i - options.momentum] - sources[i], 0));
  }

  let up = EMA.calculate({ period: options.length, values: diff1 });
  let down = EMA.calculate({ period: options.length, values: diff2 });

  let rmi = [];
  for (
    let i = 0;
    i < candles.length - options.momentum - options.length + 1;
    i++
  ) {
    rmi.push(down[i] === 0 ? 0 : 100 - 100 / (1 + up[i] / down[i]));
  }

  return rmi;
}
