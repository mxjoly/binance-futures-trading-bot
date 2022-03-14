import { normalize } from '../../utils/math';
import { FEATURES_INDICATORS } from './loadConfig';
import * as VolumeOscillator from '../../indicators/volumeOscillator';
import {
  ADX,
  AwesomeOscillator,
  CCI,
  EMA,
  IchimokuCloud,
  MFI,
  ROC,
  RSI,
  VWAP,
  WilliamsR,
} from 'technicalindicators';

export function calculateIndicators(candles: CandleData[]) {
  const ema21 =
    FEATURES_INDICATORS.EMA21 === true
      ? EMA.calculate({
          period: 21,
          values: candles.map((c) => c.close),
        }).map((v, i, l) => candles[candles.length - (l.length - i)].close - v)
      : null;

  // EMA50 (difference between current price and the value of ema)
  const ema50 = FEATURES_INDICATORS.EMA50
    ? EMA.calculate({
        period: 50,
        values: candles.map((c) => c.close),
      }).map((v, i, l) => candles[candles.length - (l.length - i)].close - v)
    : null;

  // EMA100 (difference between current price and the value of ema)
  const ema100 = FEATURES_INDICATORS.EMA100
    ? EMA.calculate({
        period: 100,
        values: candles.map((c) => c.close),
      }).map((v, i, l) => candles[candles.length - (l.length - i)].close - v)
    : null;

  // Average Directional Index
  const adx = FEATURES_INDICATORS.ADX
    ? ADX.calculate({
        period: 14,
        close: candles.map((c) => c.close),
        high: candles.map((c) => c.high),
        low: candles.map((c) => c.low),
      }).map((v) => v.adx)
    : null;

  // Awesome Indicator
  const ao = FEATURES_INDICATORS.AO
    ? AwesomeOscillator.calculate({
        fastPeriod: 5,
        slowPeriod: 25,
        high: candles.map((c) => c.high),
        low: candles.map((c) => c.low),
      })
    : null;

  // Commodity Channel Index
  const cci = FEATURES_INDICATORS.CCI
    ? CCI.calculate({
        period: 20,
        close: candles.map((c) => c.close),
        high: candles.map((c) => c.high),
        low: candles.map((c) => c.low),
      })
    : null;

  // Money Flow Index
  const mfi = FEATURES_INDICATORS.MFI
    ? MFI.calculate({
        period: 14,
        volume: candles.map((c) => c.volume),
        close: candles.map((c) => c.close),
        high: candles.map((c) => c.high),
        low: candles.map((c) => c.low),
      })
    : null;

  // Rate of Change
  const roc = FEATURES_INDICATORS.ROC
    ? ROC.calculate({
        period: 9,
        values: candles.map((c) => c.close),
      })
    : null;

  // Relative Strengh Index
  const rsi = FEATURES_INDICATORS.RSI
    ? RSI.calculate({
        period: 14,
        values: candles.map((c) => c.close),
      })
    : null;

  // William R
  const williamR = FEATURES_INDICATORS.WILLIAM_R
    ? WilliamsR.calculate({
        period: 14,
        close: candles.map((c) => c.close),
        high: candles.map((c) => c.high),
        low: candles.map((c) => c.low),
      })
    : null;

  // Ichimoku
  const kijun = FEATURES_INDICATORS.KIJUN
    ? IchimokuCloud.calculate({
        conversionPeriod: 9,
        basePeriod: 26,
        spanPeriod: 52,
        displacement: 26,
        high: candles.map((c) => c.high),
        low: candles.map((c) => c.low),
      }).map((v) => v.base)
    : null;

  // Volume Weighted Average Price
  const vwap = FEATURES_INDICATORS.VWAP
    ? VWAP.calculate({
        close: candles.map((c) => c.close),
        high: candles.map((c) => c.high),
        low: candles.map((c) => c.low),
        volume: candles.map((c) => c.volume),
      })
    : null;

  // Oscillator volume
  const volOsc = FEATURES_INDICATORS.VOL_OSC
    ? VolumeOscillator.calculate({
        shortLength: 5,
        longLength: 10,
        candles: candles,
      })
    : null;

  // Trading volume
  const vol = FEATURES_INDICATORS.VOL ? candles.map((c) => c.volume) : null;

  // Price change
  const priceChange = FEATURES_INDICATORS.PRICE_CHANGE
    ? candles.map((c) => (c.close - c.open) / c.open)
    : null;

  let indicators = [
    ema21,
    ema50,
    ema100,
    adx,
    ao,
    cci,
    mfi,
    roc,
    rsi,
    williamR,
    vwap,
    kijun,
    volOsc,
    vol,
    priceChange,
  ]
    .filter((i) => i !== null)
    .map((values) => {
      let min = Math.min(...values);
      let max = Math.max(...values);
      // Normalize all the values
      return values.map((v) => normalize(v, min, max, 0, 1));
    });

  // Get the minimum length for an indicators
  const minLength = Math.min(...indicators.map((i) => i.length));

  // Reduce the length of the length of all indicators
  indicators = indicators.map((ind) => ind.slice(-minLength));

  return indicators;
}

export function calculateIndicatorsForLastCandle(candles: CandleData[]) {
  // EMA21
  const ema21 =
    FEATURES_INDICATORS.EMA21 === true
      ? EMA.calculate({
          period: 21,
          values: candles.map((c) => c.close).slice(-21),
        }).slice(-1)[0]
      : null;

  // EMA50
  const ema50 = FEATURES_INDICATORS.EMA50
    ? EMA.calculate({
        period: 50,
        values: candles.map((c) => c.close).slice(-50),
      }).slice(-1)[0]
    : null;

  // EMA100
  const ema100 = FEATURES_INDICATORS.EMA100
    ? EMA.calculate({
        period: 100,
        values: candles.map((c) => c.close).slice(-100),
      }).slice(-1)[0]
    : null;

  // Average Directional Index
  const adx = FEATURES_INDICATORS.ADX
    ? ADX.calculate({
        period: 14,
        close: candles.map((c) => c.close).slice(-28),
        high: candles.map((c) => c.high).slice(-28),
        low: candles.map((c) => c.low).slice(-28),
      }).slice(-1)[0].adx
    : null;

  // Awesome Indicator
  const ao = FEATURES_INDICATORS.AO
    ? AwesomeOscillator.calculate({
        fastPeriod: 5,
        slowPeriod: 25,
        high: candles.map((c) => c.high).slice(-26),
        low: candles.map((c) => c.low).slice(-26),
      }).slice(-1)[0]
    : null;

  // Commodity Channel Index
  const cci = FEATURES_INDICATORS.CCI
    ? CCI.calculate({
        period: 20,
        close: candles.map((c) => c.close).slice(-21),
        high: candles.map((c) => c.high).slice(-21),
        low: candles.map((c) => c.low).slice(-21),
      }).slice(-1)[0]
    : null;

  // Money Flow Index
  const mfi = FEATURES_INDICATORS.MFI
    ? MFI.calculate({
        period: 14,
        volume: candles.map((c) => c.volume).slice(-15),
        close: candles.map((c) => c.close).slice(-15),
        high: candles.map((c) => c.high).slice(-15),
        low: candles.map((c) => c.low).slice(-15),
      }).slice(-1)[0]
    : null;

  // Rate of Change
  const roc = FEATURES_INDICATORS.ROC
    ? ROC.calculate({
        period: 9,
        values: candles.map((c) => c.close).slice(-10),
      }).slice(-1)[0]
    : null;

  // Relative Strengh Index
  const rsi = FEATURES_INDICATORS.RSI
    ? RSI.calculate({
        period: 14,
        values: candles.map((c) => c.close).slice(-15),
      }).slice(-1)[0]
    : null;

  // William R
  const williamR = FEATURES_INDICATORS.WILLIAM_R
    ? WilliamsR.calculate({
        period: 14,
        close: candles.map((c) => c.close).slice(-15),
        high: candles.map((c) => c.high).slice(-15),
        low: candles.map((c) => c.low).slice(-15),
      }).slice(-1)[0]
    : null;

  // Ichimoku
  const kijun = FEATURES_INDICATORS.KIJUN
    ? IchimokuCloud.calculate({
        conversionPeriod: 9,
        basePeriod: 26,
        spanPeriod: 52,
        displacement: 26,
        high: candles.map((c) => c.high).slice(-53),
        low: candles.map((c) => c.low).slice(-53),
      }).slice(-1)[0].base
    : null;

  // Volume Weighted Average Price
  const vwap = FEATURES_INDICATORS.VWAP
    ? VWAP.calculate({
        close: [candles[candles.length - 1].close],
        high: [candles[candles.length - 1].high],
        low: [candles[candles.length - 1].low],
        volume: [candles[candles.length - 1].volume],
      }).slice(-1)[0]
    : null;

  // Oscillator volume
  const volOsc = FEATURES_INDICATORS.VOL_OSC
    ? VolumeOscillator.calculate({
        shortLength: 5,
        longLength: 10,
        candles: candles.slice(-11),
      }).slice(-1)[0]
    : null;

  // Trading volume
  const vol = FEATURES_INDICATORS.VOL
    ? candles[candles.length - 1].volume
    : null;

  // Price change
  const priceChange = FEATURES_INDICATORS.PRICE_CHANGE
    ? (candles[candles.length - 1].close - candles[candles.length - 1].open) /
      candles[candles.length - 1].close
    : null;

  // Inputs for the neural network
  let inputs = [
    ema21,
    ema50,
    ema100,
    adx,
    ao,
    cci,
    mfi,
    roc,
    rsi,
    williamR,
    vwap,
    kijun,
    volOsc,
    vol,
    priceChange,
  ].filter((i) => i !== null);

  return inputs;
}
