import { EMA } from 'technicalindicators';

interface Detection {
  rsiPeriod?: number;
}

const defaultDetection: Detection = {
  rsiPeriod: 14,
};

const getBodyHigh = (candle: ChartCandle) =>
  Math.max(candle.close, candle.open);

const getBodyLow = (candle: ChartCandle) => Math.min(candle.close, candle.open);

const getBody = (candle: ChartCandle) =>
  getBodyHigh(candle) - getBodyLow(candle);

const hasWhiteBody = (candle: ChartCandle) => candle.open < candle.close;
const hasBlackBody = (candle: ChartCandle) => candle.open > candle.close;

export const isBullEngulfing = (
  candles: ChartCandle[],
  index = candles.length - 1,
  options = defaultDetection
) => {
  if (candles.length > options.rsiPeriod) {
    const prevCandle = candles[index - 1];
    const curCandle = candles[index];

    const bodyData = candles.map((candle) => getBody(candle));
    const emaBody = EMA.calculate({
      values: bodyData.map((body) => body),
      period: options.rsiPeriod,
    });

    const getIndex = (candle: ChartCandle) =>
      candles.findIndex((c) => c === candle);
    const getBodyAvg = (candle: ChartCandle) => emaBody[getIndex(candle)];
    const hasSmallBody = (candle: ChartCandle) =>
      getBody(candle) < getBodyAvg(candle);
    const hasLongBody = (candle: ChartCandle) =>
      getBody(candle) > getBodyAvg(candle);

    return (
      hasWhiteBody(curCandle) &&
      hasLongBody(curCandle) &&
      hasBlackBody(prevCandle) &&
      hasSmallBody(prevCandle) &&
      curCandle.close >= prevCandle.open &&
      curCandle.open <= prevCandle.close &&
      (curCandle.close > prevCandle.open || curCandle.open < prevCandle.close)
    );
  }
};

export const isBearEngulfing = (
  candles: ChartCandle[],
  index = candles.length - 1,
  options = defaultDetection
) => {
  if (candles.length > options.rsiPeriod) {
    const prevCandle = candles[index - 1];
    const curCandle = candles[index];

    const bodyData = candles.map((candle) => getBody(candle));
    const emaBody = EMA.calculate({
      values: bodyData.map((body) => body),
      period: options.rsiPeriod,
    });

    const getIndex = (candle: ChartCandle) =>
      candles.findIndex((c) => c === candle);
    const getBodyAvg = (candle: ChartCandle) => emaBody[getIndex(candle)];
    const hasSmallBody = (candle: ChartCandle) =>
      getBody(candle) < getBodyAvg(candle);
    const hasLongBody = (candle: ChartCandle) =>
      getBody(candle) > getBodyAvg(candle);

    return (
      hasBlackBody(curCandle) &&
      hasLongBody(curCandle) &&
      hasWhiteBody(prevCandle) &&
      hasSmallBody(prevCandle) &&
      curCandle.close <= prevCandle.open &&
      curCandle.open >= prevCandle.close &&
      (curCandle.close < prevCandle.open || curCandle.open > prevCandle.close)
    );
  }
};
