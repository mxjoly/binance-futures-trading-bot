import { RMA } from '..';

interface Options {
  period?: number;
}

const defaultOptions: Options = {
  period: 14,
};

export function calculate(candles: CandleData[], options?: Options) {
  options = { ...defaultOptions, ...options };
  let high = candles.map((c) => c.high);
  let low = candles.map((c) => c.low);
  let close = candles.map((c) => c.close);

  let baseLength = high.length - 1;

  let up: number[] = new Array(baseLength);
  let down: number[] = new Array(baseLength);
  for (let i = 1; i <= baseLength; i++) {
    up[i - 1] = high[i] - high[i - 1];
    down[i - 1] = -(low[i] - low[i - 1]);
  }

  let plusDM: number[] = new Array(baseLength);
  let minusDM: number[] = new Array(baseLength);
  for (let i = 0; i < baseLength; i++) {
    plusDM[i] = up[i] > down[i] && up[i] > 0 ? up[i] : 0;
    minusDM[i] = down[i] > up[i] && down[i] > 0 ? down[i] : 0;
  }

  let tr: number[] = new Array(baseLength);
  for (let i = 1; i <= baseLength; i++) {
    tr[i - 1] = Math.max(
      high[i] - low[i],
      Math.abs(high[i] - close[i - 1]),
      Math.abs(low[i] - close[i - 1])
    );
  }

  let trueRange = RMA.calculate(tr, { period: options.period });
  let plus = RMA.calculate(plusDM, { period: options.period }).map(
    (v, i) => (100 * v) / trueRange[i]
  );
  let minus = RMA.calculate(minusDM, { period: options.period }).map(
    (v, i) => (100 * v) / trueRange[i]
  );

  let sum: number[] = new Array(baseLength);
  let diff: number[] = new Array(baseLength);
  for (let i = 0; i < baseLength; i++) {
    sum[i] = plus[i] + minus[i];
    diff[i] = plus[i] - minus[i];
  }

  let adx = RMA.calculate(
    diff.map((v, i) => Math.abs(v) / (sum[i] === 0 ? 1 : sum[i])),
    { period: options.period }
  ).map((v) => 100 * v);

  let result: { adx: number; plus: number; minus: number }[] = new Array(
    baseLength
  );
  for (let i = 0; i < baseLength; i++) {
    result[i] = { adx: adx[i], minus: minus[i], plus: plus[i] };
  }

  return result;
}
