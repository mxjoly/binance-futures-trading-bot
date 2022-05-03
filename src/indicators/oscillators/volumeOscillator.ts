import { EMA } from 'technicalindicators';

interface Options {
  longLength?: number;
  shortLength?: number;
}

const defaultOptions: Options = {
  longLength: 10,
  shortLength: 5,
};

/**
 * Oscillator volume
 */
export function calculate(candles: CandleData[], options?: Options) {
  options = { ...defaultOptions, ...options };
  let volume = candles.map((c) => c.volume);
  let results: number[] = [];

  let emaVolLong = EMA.calculate({
    period: options.longLength,
    values: volume,
  });
  let emaVolShort = EMA.calculate({
    period: options.shortLength,
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
