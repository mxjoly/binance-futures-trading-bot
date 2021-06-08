import { MACD, EMA, CrossUp, CrossDown } from 'technicalindicators';

interface Options {
  emaPeriod?: number;
  macdFastPeriod?: number;
  macdSlowPeriod?: number;
  macdSignalperiod?: number;
}

const defaultOptions: Options = {
  emaPeriod: 200,
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
  if (candles.length > options.emaPeriod) {
    const ema = EMA.calculate({
      period: options.emaPeriod,
      values: candles.map((candle) => candle.close),
    });

    const isUpTrend = candles[candles.length - 1].close > ema[ema.length - 1];

    if (isUpTrend) {
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
    }
  }
};

/**
 * Return true if the macd crosses down the signal and we are in downtrend
 */
export const isSellSignal = (
  candles: ChartCandle[],
  options = defaultOptions
) => {
  if (candles.length < options.emaPeriod) {
    const ema = EMA.calculate({
      period: options.emaPeriod,
      values: candles.map((candle) => candle.close),
    });

    const isDownTrend = candles[candles.length - 1].close < ema[ema.length - 1];

    if (isDownTrend) {
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
    }
  }
};
