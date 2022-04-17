import { Pivots } from './index';

interface Options {
  left?: number;
  right?: number;
}

const defaultOptions: Options = {
  left: 5,
  right: 5,
};

export function calculate({
  candles,
  left = defaultOptions.left,
  right = defaultOptions.right,
}: {
  candles: CandleData[];
  left?: number;
  right?: number;
}) {
  let pivotsHigh = Pivots.pivotsHigh(
    candles.map((c) => c.high),
    left,
    right
  );

  let pivotsLow = Pivots.pivotsLow(
    candles.map((c) => c.low),
    left,
    right
  );

  const getLastPivotHigh = (n: number) => {
    for (let i = n; i >= 0; i--) {
      if (pivotsHigh[i]) return candles[i].high;
    }
  };

  const getLastPivotLow = (n: number) => {
    for (let i = n; i >= 0; i--) {
      if (pivotsLow[i]) return candles[i].low;
    }
  };

  let top = [];
  let bottom = [];

  for (let i = 0; i < candles.length - right; i++) {
    top[i + right] = getLastPivotHigh(i);
    bottom[i + right] = getLastPivotLow(i);
  }

  return { top, bottom };
}
