import { Pivots } from '..';

interface Options {
  maxPivotSize?: number;
  length?: number;
}

const defaultOptions: Options = {
  maxPivotSize: 100,
  length: 30,
};

export function calculate(candles: CandleData[], options?: Options) {
  options = { ...defaultOptions, ...options };
  let high = candles.map((c) => c.high);
  let low = candles.map((c) => c.low);

  let pivotHighs = Pivots.pivotHighs(high, length, 0);
  let pivotLows = Pivots.pivotLows(low, length, 0);

  let directions = new Array(high.length).fill(0);

  for (let i = 1; i < directions.length; i++) {
    if (pivotLows[i] && !pivotHighs[i]) {
      directions[i] = -1;
    } else if (pivotHighs[i] && !pivotLows[i]) {
      directions[i] = 1;
    } else {
      directions[i] = directions[i - 1];
    }
  }

  // -------------------------------------------------------- //

  // pivot: values of the pivot
  // pivotBar: index of the pivot bar
  // pivotDirection: directions of the pivot(-1 => low or 1 for high)
  let zigzag: { pivot: number; pivotBar: number; pivotDirection: 1 | -1 }[] =
    [];

  for (let i = 0; i < high.length; i++) {
    if (pivotHighs[i] || pivotLows[i]) {
      let value = directions[i] === 1 ? high[i] : low[i];
      let bar = i;
      let newDirection = directions[i];

      if (directions[i] === directions[i - 1] && zigzag.length >= 1) {
        let { pivot, pivotBar, pivotDirection } = zigzag.shift();
        let useNewValues =
          value * pivotDirection[i] < pivot * pivotDirection[i];
        value = useNewValues ? pivot : value;
        bar = useNewValues ? pivotBar[i] : bar;
      }

      if (zigzag.length >= 2) {
        let lastPoint = zigzag[1].pivot;
        newDirection =
          directions[i] * value > directions[i] * lastPoint
            ? directions[i] * 2
            : directions[i];
      }

      zigzag.unshift({
        pivot: value,
        pivotBar: bar,
        pivotDirection: newDirection,
      });

      if (zigzag.length > options.maxPivotSize) {
        zigzag.pop();
      }
    }
  }

  return zigzag.reverse();
}
