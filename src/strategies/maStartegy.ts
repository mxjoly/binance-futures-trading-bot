import { SMA, EMA, WMA, WEMA, CrossUp, CrossDown } from 'technicalindicators';
import { MAX_CANDLES_HISTORY } from '../config';

interface Options {
  maPeriod?: number;
  maType?: MAType;
}

const getMAClass = (type: MAType) =>
  type === 'SMA' ? SMA : type === 'EMA' ? EMA : type === 'WMA' ? WMA : WEMA;

/**
 * Return true if the last candle crosses up the MA
 */
export const isBuySignal = (
  candles: ChartCandle[],
  { maPeriod = 20, maType = 'SMA' }: Options
) => {
  if (candles.length >= maPeriod) {
    const ma = getMAClass(maType);

    const candleValues = candles.map((candle) => candle.close);

    const values = ma.calculate({
      values: candleValues,
      period: maPeriod,
    });

    const input = {
      lineA: candleValues.slice(-(MAX_CANDLES_HISTORY - maPeriod + 1)),
      lineB: values,
    };

    const results = CrossUp.calculate(input);
    return results[results.length - 1];
  }
};

/**
 * Return true if the last candle crosses down the MA
 */
export const isSellSignal = (
  candles: ChartCandle[],
  { maPeriod = 20, maType = 'SMA' }: Options
) => {
  if (candles.length >= maPeriod) {
    const ma = getMAClass(maType);

    const candleValues = candles.map((candle) => candle.close);

    const values = ma.calculate({
      values: candleValues,
      period: maPeriod,
    });

    const input = {
      lineA: candleValues.slice(-(MAX_CANDLES_HISTORY - maPeriod + 1)),
      lineB: values,
    };

    const results = CrossDown.calculate(input);
    return results[results.length - 1];
  }
};
