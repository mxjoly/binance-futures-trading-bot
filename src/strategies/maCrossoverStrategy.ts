import { SMA, EMA, WMA, WEMA, CrossUp, CrossDown } from 'technicalindicators';

interface Options {
  smallPeriod?: number;
  longPeriod?: number;
  smallMAType?: MAType;
  longMAType?: MAType;
}

const getMAClass = (type: MAType) =>
  type === 'SMA' ? SMA : type === 'EMA' ? EMA : type === 'WMA' ? WMA : WEMA;

/**
 * Return true if the first MA crosses up the second MA
 */
export const isBuySignal = (
  candles: ChartCandle[],
  {
    smallPeriod = 20,
    longPeriod = 50,
    smallMAType = 'SMA',
    longMAType = 'SMA',
  }: Options
) => {
  if (candles.length >= longPeriod) {
    const ma1 = getMAClass(smallMAType);
    const ma2 = getMAClass(longMAType);

    const valuesForSmallPeriod = ma1.calculate({
      values: candles.map((candle) => candle.close),
      period: smallPeriod,
    });

    const valuesForLongPeriod = ma2.calculate({
      values: candles.map((candle) => candle.close),
      period: longPeriod,
    });

    const input = { lineA: valuesForSmallPeriod, lineB: valuesForLongPeriod };

    const results = CrossUp.calculate(input);
    return results[results.length - 1] === true;
  }
};

/**
 * Return true if the first MA crosses down the second MA
 */
export const isSellSignal = (
  candles: ChartCandle[],
  {
    smallPeriod = 20,
    longPeriod = 50,
    smallMAType = 'SMA',
    longMAType = 'SMA',
  }: Options
) => {
  if (candles.length >= longPeriod) {
    const ma1 = getMAClass(smallMAType);
    const ma2 = getMAClass(longMAType);

    const valuesForSmallPeriod = ma1.calculate({
      values: candles.map((candle) => candle.close),
      period: smallPeriod,
    });

    const valuesForLongPeriod = ma2.calculate({
      values: candles.map((candle) => candle.close),
      period: longPeriod,
    });

    const input = { lineA: valuesForSmallPeriod, lineB: valuesForLongPeriod };

    const results = CrossDown.calculate(input);
    return results[results.length - 1] === true;
  }
};
