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
    ? candles.map((c, i) => {
        if (i > 10) {
          const currentPrice = candles[i].close;
          const olderPrice = candles[i - 10].close;
          return (currentPrice - olderPrice) / olderPrice;
        } else {
          return 0;
        }
      })
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
