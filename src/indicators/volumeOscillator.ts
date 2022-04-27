import { EMA } from 'technicalindicators';

interface Options {
  volume: number[];
  longLength: number;
  shortLength: number;
}

const defaultOptions = {
  longLength: 10,
  shortLength: 5,
};

/**
 * Oscillator volume
 */
export function calculate({
  volume,
  longLength = defaultOptions.longLength,
  shortLength = defaultOptions.shortLength,
}: Options) {
  let results: number[] = [];

  let emaVolLong = EMA.calculate({
    period: longLength,
    values: volume,
  });
  let emaVolShort = EMA.calculate({
    period: shortLength,
    values: volume,
  });

  for (let i = 0; i < emaVolLong.length; i++) {
    let oscillator =
      (100 *
        (emaVolShort[emaVolShort.length - 1 - i] -
          emaVolLong[emaVolLong.length - 1 - i])) /
      emaVolLong[emaVolLong.length - 1 - i];
    results.push(oscillator);
  }

  return results.reverse();
}
