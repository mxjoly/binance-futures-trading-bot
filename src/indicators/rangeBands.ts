import { EMA } from 'technicalindicators';

interface Options {
  period: number;
  multiplier: number;
  sourceType: 'close' | 'open' | 'high' | 'low';
}

const defaultOptions: Options = {
  period: 10,
  multiplier: 2.0,
  sourceType: 'open',
};

export function calculate(candles: CandleData[], options = defaultOptions) {
  let source = candles.map((c) => {
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

  let upward = new Array(candles.length).fill(0);
  let downward = new Array(candles.length).fill(0);

  let avrng = new Array(options.period - 1).fill(0).concat(
    EMA.calculate({
      period: options.period,
      values: source.map((s, i) => (i > 0 ? Math.abs(s - source[i - 1]) : 0)),
    })
  );

  let smoothrng = new Array(options.period * 2 - 2)
    .fill(0)
    .concat(EMA.calculate({ period: options.period * 2 - 1, values: avrng }))
    .map((v) => v * options.multiplier);

  let filt = new Array(candles.length).fill(0);

  for (let i = 1; i < candles.length; i++) {
    filt[i] =
      source[i] > filt[i - 1]
        ? source[i] - smoothrng[i] < filt[i - 1]
          ? filt[i - 1]
          : source[i] - smoothrng[i]
        : source[i] + smoothrng[i] > filt[i - 1]
        ? filt[i - 1]
        : source[i] + smoothrng[i];
    upward[i] =
      filt[i] > filt[i - 1]
        ? upward[i - 1] + 1
        : filt[i] < filt[i - 1]
        ? 0
        : upward[i - 1];
    downward[i] =
      filt[i] < filt[i - 1]
        ? downward[i - 1] + 1
        : filt[i] > filt[i - 1]
        ? 0
        : downward[i - 1];
  }

  // Calculate the high band and low band

  let highBand = [];
  let lowBand = [];

  for (let i = options.period; i < candles.length; i++) {
    highBand.push(filt[i] + smoothrng[i]);
    lowBand.push(filt[i] - smoothrng[i]);
  }

  return { highBand, lowBand };
}
