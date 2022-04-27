import { Pivots } from './index';

interface Options {
  high: number[];
  low: number[];
  left?: number;
  right?: number;
}

const defaultOptions = {
  left: 5,
  right: 5,
};

export function calculate({
  high,
  low,
  left = defaultOptions.left,
  right = defaultOptions.right,
}: Options) {
  let pivotsHigh = Pivots.pivotHighs({
    values: high,
    leftBars: left,
    rightBars: right,
  });

  let pivotsLow = Pivots.pivotLows({
    values: low,
    leftBars: left,
    rightBars: right,
  });

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

  for (let i = 0; i < high.length - right; i++) {
    results[i + right] = {
      top: getLastPivotHigh(i),
      bottom: getLastPivotLow(i),
    };
  }

  return results;
}
