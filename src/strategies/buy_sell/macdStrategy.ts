import { MACD, CrossUp, CrossDown } from 'technicalindicators';

interface Options {
  macdFastPeriod?: number;
  macdSlowPeriod?: number;
  macdSignalperiod?: number;
}

const defaultOptions: Options = {
  macdFastPeriod: 12,
  macdSlowPeriod: 26,
  macdSignalperiod: 9,
};

/**
 * Return true if the macd crosses up the signal and we are in uptrend
 */
export const isBuySignal = (
  candles: ChartCandle[],
  options = defaultOptions
) => {
  const macd = MACD.calculate({
    values: candles.map((candle) => candle.close),
    fastPeriod: options.macdFastPeriod,
    slowPeriod: options.macdSlowPeriod,
    signalPeriod: options.macdSignalperiod,
    SimpleMAOscillator: false,
    SimpleMASignal: false,
  });

  const results = CrossUp.calculate({
    lineA: macd.map((a) => a.MACD),
    lineB: macd.map((a) => a.signal),
  });

  return results[results.length - 1];
};

/**
 * Return true if the macd crosses down the signal and we are in downtrend
 */
export const isSellSignal = (
  candles: ChartCandle[],
  options = defaultOptions
) => {
  const macd = MACD.calculate({
    values: candles.map((candle) => candle.close),
    fastPeriod: options.macdFastPeriod,
    slowPeriod: options.macdSlowPeriod,
    signalPeriod: options.macdSignalperiod,
    SimpleMAOscillator: false,
    SimpleMASignal: false,
  });

  const results = CrossDown.calculate({
    lineA: macd.map((a) => a.MACD),
    lineB: macd.map((a) => a.signal),
  });

  return results[results.length - 1];
};
