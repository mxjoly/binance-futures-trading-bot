import { SMA, CrossUp, CrossDown } from 'technicalindicators';
import { MAX_CANDLES_HISTORY } from '../config';

const SMA_PERIOD = 20;

/**
 * Return true if the last candle crosses up the SMA
 */
export const isBuySignal = (candles: ChartCandle[]) => {
  if (candles.length >= SMA_PERIOD) {
    const candleValues = candles.map((candle) => candle.close);

    const values = SMA.calculate({
      values: candleValues,
      period: SMA_PERIOD,
    });

    const input = {
      lineA: candleValues.slice(-(MAX_CANDLES_HISTORY - SMA_PERIOD + 1)),
      lineB: values,
    };

    const results = CrossUp.calculate(input);
    return results[results.length - 1];
  }
};

/**
 * Return true if the last candle crosses down the SMA
 */
export const isSellSignal = (candles: ChartCandle[]) => {
  if (candles.length >= SMA_PERIOD) {
    const candleValues = candles.map((candle) => candle.close);

    const values = SMA.calculate({
      values: candleValues,
      period: SMA_PERIOD,
    });

    const input = {
      lineA: candleValues.slice(-(MAX_CANDLES_HISTORY - SMA_PERIOD + 1)),
      lineB: values,
    };

    const results = CrossDown.calculate(input);
    return results[results.length - 1];
  }
};
