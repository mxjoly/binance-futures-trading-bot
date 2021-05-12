import { Candle } from 'binance-api-node';
import { SMA, CrossUp, CrossDown } from 'technicalindicators';

const SMA_SMALL_PERIOD = 20;
const SMA_LONG_PERIOD = 50;

/**
 * Return true if the SMA 20 cross up the SMA 50
 * @param candles
 * @returns
 */
export const isBuySignal = (candles: Candle[]) => {
  if (candles.length >= SMA_LONG_PERIOD) {
    const valuesForSmallPeriod = SMA.calculate({
      values: candles.map((candle) => Number(candle.close)),
      period: SMA_SMALL_PERIOD,
    });

    const valuesForLongPeriod = SMA.calculate({
      values: candles.map((candle) => Number(candle.close)),
      period: SMA_LONG_PERIOD,
    });

    const input = {
      lineA: valuesForSmallPeriod,
      lineB: valuesForLongPeriod,
    };

    const results = CrossUp.calculate(input);
    return results[results.length - 1];
  }
};

/**
 * Return true if the SMA 20 cross down the SMA 50
 * @param candles
 */
export const isSellSignal = (candles: Candle[]) => {
  if (candles.length >= SMA_LONG_PERIOD) {
    const valuesForSmallPeriod = SMA.calculate({
      values: candles.map((candle) => Number(candle.close)),
      period: SMA_SMALL_PERIOD,
    });

    const valuesForLongPeriod = SMA.calculate({
      values: candles.map((candle) => Number(candle.close)),
      period: SMA_LONG_PERIOD,
    });

    const input = {
      lineA: valuesForSmallPeriod,
      lineB: valuesForLongPeriod,
    };

    const results = CrossDown.calculate(input);
    return results[results.length - 1];
  }
};
