import { Pivots } from '../index';

interface Options {
  leftBars?: number;
  rightBars?: number;
}

const defaultOptions: Options = {
  leftBars: 5,
  rightBars: 5,
};

export function calculate(candles: CandleData[], options?: Options) {
  options = { ...defaultOptions, ...options };
  let high = candles.map((c) => c.high);
  let low = candles.map((c) => c.low);

  let pivotsHigh = Pivots.pivotHighs(high, options.leftBars, options.rightBars);
  let pivotsLow = Pivots.pivotLows(low, options.leftBars, options.rightBars);

  const getLastPivotHigh = (n: number) => {
    for (let i = n; i >= 0; i--) {
      if (pivotsHigh[i]) return high[i];
    }
  };

  const getLastPivotLow = (n: number) => {
    for (let i = n; i >= 0; i--) {
      if (pivotsLow[i]) return low[i];
    }
  };

  let results: { top: number; bottom: number }[] = [];

  for (let i = 0; i < high.length - options.rightBars; i++) {
    results[i + options.rightBars] = {
      top: getLastPivotHigh(i),
      bottom: getLastPivotLow(i),
    };
  }

  return results;
}
