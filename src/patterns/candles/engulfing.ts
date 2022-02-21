import { EMA } from 'technicalindicators';

interface Detection {
  rsiPeriod?: number;
}

const defaultDetection: Detection = {
  rsiPeriod: 14,
};

const getBodyHigh = (candle: CandleData) => Math.max(candle.close, candle.open);

const getBodyLow = (candle: CandleData) => Math.min(candle.close, candle.open);

const getBody = (candle: CandleData) =>
  getBodyHigh(candle) - getBodyLow(candle);

const hasWhiteBody = (candle: CandleData) => candle.open < candle.close;
const hasBlackBody = (candle: CandleData) => candle.open > candle.close;

export const isBullEngulfing = (
  candles: CandleData[],
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

    const getIndex = (candle: CandleData) =>
      candles.findIndex((c) => c === candle);
    const getBodyAvg = (candle: CandleData) => emaBody[getIndex(candle)];
    const hasSmallBody = (candle: CandleData) =>
      getBody(candle) < getBodyAvg(candle);
    const hasLongBody = (candle: CandleData) =>
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
  candles: CandleData[],
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

    const getIndex = (candle: CandleData) =>
      candles.findIndex((c) => c === candle);
    const getBodyAvg = (candle: CandleData) => emaBody[getIndex(candle)];
    const hasSmallBody = (candle: CandleData) =>
      getBody(candle) < getBodyAvg(candle);
    const hasLongBody = (candle: CandleData) =>
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
