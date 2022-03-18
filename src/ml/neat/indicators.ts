import { CANDLE_MIN_LENGTH } from '.';
import { normalize } from '../../utils/math';
import * as VolumeOscillator from '../../indicators/volumeOscillator';
import { NEURAL_NETWORK_INDICATORS_INPUTS } from './loadConfig';
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

/**
 * Calculate the indicator values
 * @param candles
 */
export function calculateIndicators(candles: CandleData[]) {
  // EMA21 (difference between current price and the value of ema)
  const ema21 =
    NEURAL_NETWORK_INDICATORS_INPUTS.EMA21 === true
      ? EMA.calculate({
          period: 21,
          values: candles.map((c) => c.close),
        }).map((v, i, l) => candles[candles.length - (l.length - i)].close - v)
      : null;

  // EMA50 (difference between current price and the value of ema)
  const ema50 = NEURAL_NETWORK_INDICATORS_INPUTS.EMA50
    ? EMA.calculate({
        period: 50,
        values: candles.map((c) => c.close),
      }).map((v, i, l) => candles[candles.length - (l.length - i)].close - v)
    : null;

  // EMA100 (difference between current price and the value of ema)
  const ema100 = NEURAL_NETWORK_INDICATORS_INPUTS.EMA100
    ? EMA.calculate({
        period: 100,
        values: candles.map((c) => c.close),
      }).map((v, i, l) => candles[candles.length - (l.length - i)].close - v)
    : null;

  // Average Directional Index
  const adx = NEURAL_NETWORK_INDICATORS_INPUTS.ADX
    ? ADX.calculate({
        period: 14,
        close: candles.map((c) => c.close),
        high: candles.map((c) => c.high),
        low: candles.map((c) => c.low),
      }).map((v) => v.adx)
    : null;

  // Awesome Indicator
  const ao = NEURAL_NETWORK_INDICATORS_INPUTS.AO
    ? AwesomeOscillator.calculate({
        fastPeriod: 5,
        slowPeriod: 25,
        high: candles.map((c) => c.high),
        low: candles.map((c) => c.low),
      })
    : null;

  // Commodity Channel Index
  const cci = NEURAL_NETWORK_INDICATORS_INPUTS.CCI
    ? CCI.calculate({
        period: 20,
        close: candles.map((c) => c.close),
        high: candles.map((c) => c.high),
        low: candles.map((c) => c.low),
      })
    : null;

  // Money Flow Index
  const mfi = NEURAL_NETWORK_INDICATORS_INPUTS.MFI
    ? MFI.calculate({
        period: 14,
        volume: candles.map((c) => c.volume),
        close: candles.map((c) => c.close),
        high: candles.map((c) => c.high),
        low: candles.map((c) => c.low),
      })
    : null;

  // Rate of Change
  const roc = NEURAL_NETWORK_INDICATORS_INPUTS.ROC
    ? ROC.calculate({
        period: 9,
        values: candles.map((c) => c.close),
      })
    : null;

  // Relative Strengh Index
  const rsi = NEURAL_NETWORK_INDICATORS_INPUTS.RSI
    ? RSI.calculate({
        period: 14,
        values: candles.map((c) => c.close),
      })
    : null;

  // William R
  const williamR = NEURAL_NETWORK_INDICATORS_INPUTS.WILLIAM_R
    ? WilliamsR.calculate({
        period: 14,
        close: candles.map((c) => c.close),
        high: candles.map((c) => c.high),
        low: candles.map((c) => c.low),
      })
    : null;

  // Ichimoku
  const kijun = NEURAL_NETWORK_INDICATORS_INPUTS.KIJUN
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
  const vwap = NEURAL_NETWORK_INDICATORS_INPUTS.VWAP
    ? VWAP.calculate({
        close: candles.map((c) => c.close),
        high: candles.map((c) => c.high),
        low: candles.map((c) => c.low),
        volume: candles.map((c) => c.volume),
      })
    : null;

  // Oscillator volume
  const volOsc = NEURAL_NETWORK_INDICATORS_INPUTS.VOL_OSC
    ? VolumeOscillator.calculate({
        shortLength: 5,
        longLength: 10,
        candles: candles,
      })
    : null;

  // Trading volume
  const vol = NEURAL_NETWORK_INDICATORS_INPUTS.VOL
    ? candles.map((c) => c.volume)
    : null;

  // Price change
  const priceChange = NEURAL_NETWORK_INDICATORS_INPUTS.PRICE_CHANGE
    ? candles.map((c) => (c.close - c.open) / c.open)
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
  ]
    .filter((i) => i !== null)
    .slice(CANDLE_MIN_LENGTH)
    .map((values) => {
      let min = Math.min(...values);
      let max = Math.max(...values);
      // Normalize the values and get the last
      return normalize(values[values.length - 1], min, max, 0, 1);
    });

  return inputs;
}