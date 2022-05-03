import { ATR, Lowest, Highest } from 'technicalindicators';

interface Options {
  atrPeriod?: number;
  atrMultiplier?: number;
}

const defaultOptions: Options = {
  atrPeriod: 10,
  atrMultiplier: 3.0,
};

export function calculate(
  candles: CandleData[],
  options?: Options
): { trend: number; up: number; down: number }[] {
  options = { ...defaultOptions, ...options };
  let high = candles.map((c) => c.high);
  let low = candles.map((c) => c.low);
  let close = candles.map((c) => c.close);

  const atr = ATR.calculate({ high, low, close, period: options.atrPeriod });
  close = close.slice(-atr.length);

  const highest = Highest.calculate({
    values: high,
    period: options.atrPeriod,
  }).slice(-atr.length);

  const lowest = Lowest.calculate({
    values: low,
    period: options.atrPeriod,
  }).slice(-atr.length);

  let up: number[] = [];
  let down: number[] = [];
  let trend: number[] = [];

  for (let i = 0; i < atr.length; i++) {
    up[i] = (highest[i] + lowest[i]) / 2 - options.atrMultiplier * atr[i];
    down[i] = (highest[i] + lowest[i]) / 2 + options.atrMultiplier * atr[i];
    trend[i] = 1;

    if (i > 0) {
      up[i] = close[i - 1] > up[i - 1] ? Math.max(up[i], up[i - 1]) : up[i];
      down[i] =
        close[i - 1] < down[i - 1] ? Math.min(down[i], down[i - 1]) : down[i];
      trend[i] = trend[i - 1];
      trend[i] =
        trend[i] === -1 && close[i] > down[i]
          ? 1
          : trend[i] === 1 && close[i] < up[i]
          ? -1
          : trend[i];
    }
  }

  let results: { trend: number; up: number; down: number }[] = [];
  for (let i = 0; i < atr.length; i++) {
    results[i] = { trend: trend[i], up: up[i], down: down[i] };
  }

  return results;
}
