import { SMA, EMA, WMA, WEMA, CrossUp, CrossDown } from 'technicalindicators';

interface Options {
  smallPeriod?: number;
  longPeriod?: number;
  smallMAType?: MAType;
  longMAType?: MAType;
}

const defaultOption: Options = {
  smallPeriod: 20,
  longPeriod: 50,
  smallMAType: 'SMA',
  longMAType: 'SMA',
};

const getMAClass = (type: MAType) =>
  type === 'SMA' ? SMA : type === 'EMA' ? EMA : type === 'WMA' ? WMA : WEMA;

/**
 * Return true if the first MA crosses up the second MA
 */
export const isBuySignal = (candles: CandleData[], options = defaultOption) => {
  if (candles.length < Math.max(options.smallPeriod, options.longPeriod))
    return false;

  const ma1 = getMAClass(options.smallMAType);
  const ma2 = getMAClass(options.longMAType);

  const valuesForSmallPeriod = ma1.calculate({
    values: candles.map((candle) => candle.close),
    period: options.smallPeriod,
  });

  const valuesForLongPeriod = ma2.calculate({
    values: candles.map((candle) => candle.close),
    period: options.longPeriod,
  });

  const input = {
    lineA: valuesForSmallPeriod.slice(-2),
    lineB: valuesForLongPeriod.slice(-2),
  };

  const results = CrossUp.calculate(input);
  return results[results.length - 1] === true;
};

/**
 * Return true if the first MA crosses down the second MA
 */
export const isSellSignal = (
  candles: CandleData[],
  options = defaultOption
) => {
  if (candles.length >= options.longPeriod) {
    const ma1 = getMAClass(options.smallMAType);
    const ma2 = getMAClass(options.longMAType);

    const valuesForSmallPeriod = ma1.calculate({
      values: candles.map((candle) => candle.close),
      period: options.smallPeriod,
    });

    const valuesForLongPeriod = ma2.calculate({
      values: candles.map((candle) => candle.close),
      period: options.longPeriod,
    });

    const input = {
      lineA: valuesForSmallPeriod.slice(-2),
      lineB: valuesForLongPeriod.slice(-2),
    };

    const results = CrossDown.calculate(input);
    return results[results.length - 1] === true;
  }
};
