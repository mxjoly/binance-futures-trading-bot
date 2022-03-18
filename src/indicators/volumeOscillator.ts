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
export function calculate({
  candles,
  longLength = defaultOptions.longLength,
  shortLength = defaultOptions.shortLength,
}: {
  candles: CandleData[];
  longLength?: number;
  shortLength?: number;
}) {
  let results: number[] = [];

  let emaVolLong = EMA.calculate({
    period: longLength,
    values: candles.map((candle) => candle.volume).slice(-longLength - 1),
  });
  let emaVolShort = EMA.calculate({
    period: shortLength,
    values: candles.map((candle) => candle.volume).slice(-shortLength - 1),
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
