import { Candle } from 'binance-api-node';
import { SMA, CrossUp, CrossDown } from 'technicalindicators';

const SMA_PERIOD = 20;

/**
 * Return true if the last candle crosses up the SMA
 */
export const isBuySignal = (candles: Candle[]) => {
  if (candles.length >= SMA_PERIOD) {
    const values = SMA.calculate({
      values: candles.map((candle) => Number(candle.close)),
      period: SMA_PERIOD,
    });

    const input = {
      lineA: candles.map((candle) => Number(candle.close)),
      lineB: values,
    };

    const results = CrossUp.calculate(input);
    return results[results.length - 1] === true;
  }
};

/**
 * Return true if the last candle crosses down the SMA
 */
export const isSellSignal = (candles: Candle[]) => {
  if (candles.length >= SMA_PERIOD) {
    const values = SMA.calculate({
      values: candles.map((candle) => Number(candle.close)),
      period: SMA_PERIOD,
    });

    const input = {
      lineA: candles.map((candle) => Number(candle.close)),
      lineB: values,
    };

    const results = CrossDown.calculate(input);
    return results[results.length - 1] === true;
  }
};
