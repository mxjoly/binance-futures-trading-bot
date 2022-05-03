import { CrossUp, CrossDown } from 'technicalindicators';
import { MACD } from '../../../indicators';

interface Options {
  macdFastPeriod?: number;
  macdSlowPeriod?: number;
  macdSignalperiod?: number;
  oscillatorMaType?: 'SMA' | 'EMA';
  signalMaType?: 'SMA' | 'EMA';
}

const defaultOptions: Options = {
  macdFastPeriod: 12,
  macdSlowPeriod: 26,
  macdSignalperiod: 9,
  oscillatorMaType: 'EMA',
  signalMaType: 'EMA',
};

/**
 * Return true if the macd crosses up the signal and we are in uptrend
 */
export const isBuySignal = (
  candles: CandleData[],
  options = defaultOptions
) => {
  if (candles.length < Math.max(options.macdSlowPeriod, options.macdFastPeriod))
    return false;

  const macd = MACD.calculate(candles, {
    fastLength: options.macdFastPeriod,
    slowLength: options.macdSlowPeriod,
    signalLength: options.macdSignalperiod,
    oscillatorMaType: options.oscillatorMaType,
    signalMaType: options.signalMaType,
  });

  const results = CrossUp.calculate({
    lineA: macd.map((a) => a.macd),
    lineB: macd.map((a) => a.signal),
  });

  return results[results.length - 1];
};

/**
 * Return true if the macd crosses down the signal and we are in downtrend
 */
export const isSellSignal = (
  candles: CandleData[],
  options = defaultOptions
) => {
  if (candles.length < Math.max(options.macdSlowPeriod, options.macdFastPeriod))
    return false;

  const macd = MACD.calculate(candles, {
    fastLength: options.macdFastPeriod,
    slowLength: options.macdSlowPeriod,
    signalLength: options.macdSignalperiod,
    oscillatorMaType: options.oscillatorMaType,
    signalMaType: options.signalMaType,
  });

  const results = CrossDown.calculate({
    lineA: macd.map((a) => a.macd),
    lineB: macd.map((a) => a.signal),
  });

  return results[results.length - 1];
};
