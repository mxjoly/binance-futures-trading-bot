import { CandleChartInterval } from 'binance-api-node';
import { MACD, ADX } from '../../../indicators';

interface Options {
  lowerTimeFrame?: CandleChartInterval;
  higherTimeFrame?: CandleChartInterval;
  macdLtfFastPeriod?: number;
  macdLtfSlowPeriod?: number;
  macdLtfSignalPeriod?: number;
  macdHtfFastPeriod?: number;
  macdHtfSlowPeriod?: number;
  macdHtfSignalPeriod?: number;
  macdOscillatorMaType?: 'SMA' | 'EMA';
  macdSignalMaType?: 'SMA' | 'EMA';
  adxPeriod?: number;
  adxThreshold?: number;
}

const defaultOptions: Options = {
  lowerTimeFrame: CandleChartInterval.FIFTEEN_MINUTES,
  higherTimeFrame: CandleChartInterval.ONE_HOUR,
  macdLtfFastPeriod: 12,
  macdLtfSlowPeriod: 26,
  macdLtfSignalPeriod: 9,
  macdHtfFastPeriod: 12,
  macdHtfSlowPeriod: 26,
  macdHtfSignalPeriod: 9,
  macdOscillatorMaType: 'EMA',
  macdSignalMaType: 'SMA',
  adxPeriod: 14,
  adxThreshold: 25,
};

const macdLtfSignalEntry = (
  candles: CandleData[],
  { fastPeriod, slowPeriod, signalPeriod, oscillatorMaType, signalMaType }
) => {
  const macd = MACD.calculate(candles, {
    fastLength: fastPeriod,
    slowLength: slowPeriod,
    signalLength: signalPeriod,
    oscillatorMaType,
    signalMaType,
  }).slice(-2);

  let macdLtfLongSignal =
    macd[0].macd < macd[0].signal && macd[1].macd > macd[1].signal;
  let macdLtfShortSignal =
    macd[0].macd > macd[0].signal && macd[1].macd < macd[1].signal;

  return { macdLtfLongSignal, macdLtfShortSignal };
};

const macdHtfCondition = (
  candles: CandleData[],
  { fastPeriod, slowPeriod, signalPeriod, oscillatorMaType, signalMaType }
) => {
  const macd = MACD.calculate(candles, {
    fastLength: fastPeriod,
    slowLength: slowPeriod,
    signalLength: signalPeriod,
    oscillatorMaType,
    signalMaType,
  }).slice(-1)[0];

  let macdHtfLongCondition = macd.macd > macd.signal;
  let macdHtfShortCondition = macd.macd < macd.signal;

  return { macdHtfLongCondition, macdHtfShortCondition };
};

const adxCondition = (candles: CandleData[], { period, threshold }) => {
  const adx = ADX.calculate(candles, { period }).slice(-1)[0];
  let adxLongCondition = adx.adx > threshold && adx.pdi > adx.mdi;
  let adxShortCondition = adx.adx > threshold && adx.pdi < adx.mdi;
  return { adxLongCondition, adxShortCondition };
};

export const isBuySignal = (
  candles: CandlesDataMultiTimeFrames,
  options?: Options
) => {
  options = { ...defaultOptions, ...options };
  let { macdLtfLongSignal } = macdLtfSignalEntry(
    candles[options.lowerTimeFrame],
    {
      fastPeriod: options.macdLtfFastPeriod,
      slowPeriod: options.macdLtfSlowPeriod,
      signalPeriod: options.macdLtfSignalPeriod,
      oscillatorMaType: options.macdOscillatorMaType,
      signalMaType: options.macdSignalMaType,
    }
  );

  let { macdHtfLongCondition } = macdHtfCondition(
    candles[options.higherTimeFrame],
    {
      fastPeriod: options.macdHtfFastPeriod,
      slowPeriod: options.macdHtfSlowPeriod,
      signalPeriod: options.macdHtfSignalPeriod,
      oscillatorMaType: options.macdOscillatorMaType,
      signalMaType: options.macdSignalMaType,
    }
  );

  let { adxLongCondition } = adxCondition(candles[options.lowerTimeFrame], {
    period: options.adxPeriod,
    threshold: options.adxThreshold,
  });

  return macdLtfLongSignal && macdHtfLongCondition && adxLongCondition;
};

export const isSellSignal = (
  candles: CandlesDataMultiTimeFrames,
  options?: Options
) => {
  options = { ...defaultOptions, ...options };

  let { macdLtfShortSignal } = macdLtfSignalEntry(
    candles[options.lowerTimeFrame],
    {
      fastPeriod: options.macdLtfFastPeriod,
      slowPeriod: options.macdLtfSlowPeriod,
      signalPeriod: options.macdLtfSignalPeriod,
      oscillatorMaType: options.macdOscillatorMaType,
      signalMaType: options.macdSignalMaType,
    }
  );

  let { macdHtfShortCondition } = macdHtfCondition(
    candles[options.higherTimeFrame],
    {
      fastPeriod: options.macdHtfFastPeriod,
      slowPeriod: options.macdHtfSlowPeriod,
      signalPeriod: options.macdHtfSignalPeriod,
      oscillatorMaType: options.macdOscillatorMaType,
      signalMaType: options.macdSignalMaType,
    }
  );

  let { adxShortCondition } = adxCondition(candles[options.lowerTimeFrame], {
    period: options.adxPeriod,
    threshold: options.adxThreshold,
  });

  return macdLtfShortSignal && macdHtfShortCondition && adxShortCondition;
};
