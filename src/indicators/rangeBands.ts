import { EMA } from 'technicalindicators';

interface Options {
  values: number[];
  period: number;
  multiplier: number;
}

const defaultOptions = {
  period: 10,
  multiplier: 2.0,
};

export function calculate({
  values,
  period = defaultOptions.period,
  multiplier = defaultOptions.multiplier,
}: Options) {
  let upward = new Array(values.length).fill(0);
  let downward = new Array(values.length).fill(0);

  let avrng = new Array(period - 1).fill(0).concat(
    EMA.calculate({
      period,
      values: values.map((s, i) => (i > 0 ? Math.abs(s - values[i - 1]) : 0)),
    })
  );

  let smoothrng = new Array(period * 2 - 2)
    .fill(0)
    .concat(EMA.calculate({ period: period * 2 - 1, values: avrng }))
    .map((v) => v * multiplier);

  let filt = new Array(values.length).fill(0);

  for (let i = 1; i < values.length; i++) {
    filt[i] =
      values[i] > filt[i - 1]
        ? values[i] - smoothrng[i] < filt[i - 1]
          ? filt[i - 1]
          : values[i] - smoothrng[i]
        : values[i] + smoothrng[i] > filt[i - 1]
        ? filt[i - 1]
        : values[i] + smoothrng[i];
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

  for (let i = period; i < values.length; i++) {
    highBand.push(filt[i] + smoothrng[i]);
    lowBand.push(filt[i] - smoothrng[i]);
  }

  return { highBand, lowBand };
}
