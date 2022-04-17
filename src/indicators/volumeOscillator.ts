import { EMA } from 'technicalindicators';

interface Options {
  longLength: number;
  shortLength: number;
}

const defaultOptions: Options = {
  longLength: 10,
  shortLength: 5,
};

/**
 * Oscillator volume
 */
export function calculate(candles: CandleData[], options = defaultOptions) {
  let results: number[] = [];

  let emaVolLong = EMA.calculate({
    period: options.longLength,
    values: candles.map((candle) => candle.volume),
  });
  let emaVolShort = EMA.calculate({
    period: options.shortLength,
    values: candles.map((candle) => candle.volume),
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
