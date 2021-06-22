import { CandleChartInterval } from 'binance-api-node';
import { MACD } from 'technicalindicators';
import { loadCandles } from '../utils';

interface Options {
  fastPeriod?: number;
  slowPeriod?: number;
  signalPeriod?: number;
  crossScore?: number;
  indicatorSide?: number;
  histogramSide?: number;
}

const defaultOptions: Options = {
  fastPeriod: 12,
  slowPeriod: 26,
  signalPeriod: 9,
  crossScore: 10,
  indicatorSide: 8,
  histogramSide: 2,
};

const minutes = (interval: CandleChartInterval) => {
  switch (interval) {
    case CandleChartInterval.ONE_MINUTE:
      return 1;
    case CandleChartInterval.THREE_MINUTES:
      return 3;
    case CandleChartInterval.FIVE_MINUTES:
      return 5;
    case CandleChartInterval.FIFTEEN_MINUTES:
      return 15;
    case CandleChartInterval.THIRTY_MINUTES:
      return 30;
    case CandleChartInterval.ONE_HOUR:
      return 60;
    case CandleChartInterval.TWO_HOURS:
      return 120;
    case CandleChartInterval.FOUR_HOURS:
      return 240;
    case CandleChartInterval.ONE_DAY:
      return 60 * 24;
    case CandleChartInterval.ONE_WEEK:
      return 24 * 60 * 7;
    default:
      return;
  }
};

const higherTimeFrame = (interval: CandleChartInterval) => {
  switch (interval) {
    case CandleChartInterval.ONE_MINUTE:
      return 5;
    case CandleChartInterval.THREE_MINUTES:
    case CandleChartInterval.FIVE_MINUTES:
      return 15;
    case CandleChartInterval.FIFTEEN_MINUTES:
    case CandleChartInterval.THIRTY_MINUTES:
      return 60;
    case CandleChartInterval.ONE_HOUR:
    case CandleChartInterval.TWO_HOURS:
      return 240;
    case CandleChartInterval.FOUR_HOURS:
      return 24 * 60;
    default:
      return 24 * 60 * 7;
  }
};

const higherInterval = (interval: CandleChartInterval) => {
  switch (interval) {
    case CandleChartInterval.ONE_MINUTE:
      return CandleChartInterval.FIVE_MINUTES;
    case CandleChartInterval.THREE_MINUTES:
    case CandleChartInterval.FIVE_MINUTES:
      return CandleChartInterval.FIFTEEN_MINUTES;
    case CandleChartInterval.FIFTEEN_MINUTES:
    case CandleChartInterval.THIRTY_MINUTES:
      return CandleChartInterval.ONE_HOUR;
    case CandleChartInterval.ONE_HOUR:
    case CandleChartInterval.TWO_HOURS:
      return CandleChartInterval.FOUR_HOURS;
    case CandleChartInterval.FOUR_HOURS:
      return CandleChartInterval.ONE_DAY;
    default:
      return CandleChartInterval.ONE_WEEK;
  }
};

const calculate = (interval: CandleChartInterval) => {
  switch (interval) {
    case CandleChartInterval.ONE_MINUTE:
    case CandleChartInterval.THREE_MINUTES:
    case CandleChartInterval.FIVE_MINUTES:
      return 5;
    case CandleChartInterval.FIFTEEN_MINUTES:
    case CandleChartInterval.THIRTY_MINUTES:
    case CandleChartInterval.ONE_HOUR:
      return 4;
    case CandleChartInterval.TWO_HOURS:
      return 3;
    case CandleChartInterval.FOUR_HOURS:
      return 6;
    case CandleChartInterval.ONE_DAY:
      return 5;
    default:
      return 5;
  }
};

/**
 * Ceil a date to the nearest x minutes
 * @param minutes - the number of minutes in a cycle
 * @param date - a date
 * @param addCycle - Optional cycle to add
 */
const getCeilDate = (minutes: number, date = new Date(), addCycle = 0) => {
  let ms = 1000 * 60 * minutes; // convert minutes to ms
  return Math.ceil(date.getTime() / ms) * ms + addCycle * ms;
};

function changeResolution<T>(
  slowTFVal: T[],
  fastTFVal: T[],
  timeFrame: number
) {
  const result: T[] = [];
  const n = fastTFVal.length % timeFrame;
  for (let i = 0; i < slowTFVal.length; i++) {
    if (i === slowTFVal.length - 1 && n > 0) {
      for (let j = 0; j < n; j++) result.push(slowTFVal[i]);
    } else {
      for (let j = 0; j < timeFrame; j++) result.push(slowTFVal[i]);
    }
  }
  return result;
}

const calculatePoints = (candles: ChartCandle[], options: Options) => {
  const macd = MACD.calculate({
    values: candles.map((candle) => candle.close),
    fastPeriod: options.fastPeriod,
    slowPeriod: options.slowPeriod,
    signalPeriod: options.signalPeriod,
    SimpleMAOscillator: false,
    SimpleMASignal: false,
  });

  const getAnalysis = (i: number) => {
    const ind = macd.map((m) => m.MACD);
    const hist = macd.map((m) => m.histogram);
    const signal = macd.map((m) => m.signal);

    let analyse =
      ind[i] > ind[i - 1]
        ? hist[i] > hist[i - 1]
          ? options.indicatorSide + options.histogramSide
          : hist[i] === hist[i - 1]
          ? options.indicatorSide
          : options.indicatorSide - options.histogramSide
        : 0;
    analyse +=
      ind[i] < ind[i - 1]
        ? hist[i] < hist[i - 1]
          ? -(options.indicatorSide + options.histogramSide)
          : hist[i] === hist[i - 1]
          ? -options.indicatorSide
          : -(options.indicatorSide - options.histogramSide)
        : 0;
    analyse +=
      ind[i] === ind[i - 1]
        ? hist[i] > hist[i - 1]
          ? options.histogramSide
          : hist[i] < hist[i - 1]
          ? -options.histogramSide
          : 0
        : 0;

    const getCrossPoints = (i: number) => {
      return ind[i] >= signal[i] && ind[i - 1] < signal[i - 1]
        ? options.crossScore
        : ind[i] <= signal[i] && ind[i - 1] > signal[i - 1]
        ? -options.crossScore
        : 0;
    };

    // cross now earlier ?
    let countCross = getCrossPoints(i);
    return isNaN(analyse) ? 0 + countCross : analyse + countCross;
  };

  const maxPeriod = Math.max(
    options.fastPeriod,
    options.slowPeriod,
    options.signalPeriod
  );
  return candles.slice(maxPeriod - 1).map((candle, i) => getAnalysis(i));
};

export const isBuySignal = async (
  candles: ChartCandle[],
  options = defaultOptions
) => {
  const symbol = candles[0].symbol;
  const interval = candles[0].interval;
  const hInterval = higherInterval(interval);
  const hTimeFrame = higherTimeFrame(interval);
  const higherTimeFrameCandles = await loadCandles(symbol, hInterval, false);
  const maxPeriod = Math.max(
    options.fastPeriod,
    options.slowPeriod,
    options.signalPeriod
  );

  let firstCandleDate = new Date(candles[0].closeTime);
  let firstDate = getCeilDate(hTimeFrame, firstCandleDate, maxPeriod);
  let firstIndexFromStart1 = candles.findIndex(
    (candle) =>
      candle.closeTime + 1 - minutes(interval) * 60 * 1000 === firstDate
  );
  let firstIndexFromEnd1 = -(candles.length - firstIndexFromStart1);
  let analysis = calculatePoints(candles, options).slice(firstIndexFromEnd1);

  let firstIndexFromStart2 = higherTimeFrameCandles.findIndex(
    (candle) =>
      candle.closeTime + 1 - minutes(hInterval) * 60 * 1000 === firstDate
  );
  let firstIndexFromEnd2 = -(
    higherTimeFrameCandles.length - firstIndexFromStart2
  );
  let analysisHigherTimeFrame = calculatePoints(
    higherTimeFrameCandles,
    options
  ).slice(firstIndexFromEnd2);
  analysisHigherTimeFrame = changeResolution(
    analysisHigherTimeFrame,
    analysis,
    higherTimeFrame(interval)
  );

  const curResult =
    (analysisHigherTimeFrame[analysisHigherTimeFrame.length - 1] *
      calculate(interval) +
      analysis[analysis.length - 1]) /
    (calculate(interval) + 1);
  const prevResult =
    (analysisHigherTimeFrame[analysisHigherTimeFrame.length - 2] *
      calculate(interval) +
      analysis[analysis.length - 2]) /
    (calculate(interval) + 1);

  console.log(new Date(candles[candles.length - 1].closeTime + 1 - 1000));
  console.log(curResult);
  console.log(prevResult);
  return curResult > 0 && prevResult < 0;
};

export const isSellSignal = async (
  candles: ChartCandle[],
  options = defaultOptions
) => {
  const symbol = candles[0].symbol;
  const interval = candles[0].interval;
  const hInterval = higherInterval(interval);
  const hTimeFrame = higherTimeFrame(interval);
  const higherTimeFrameCandles = await loadCandles(symbol, hInterval, false);
  const maxPeriod = Math.max(
    options.fastPeriod,
    options.slowPeriod,
    options.signalPeriod
  );

  let firstCandleDate = new Date(candles[0].closeTime);
  let firstDate = getCeilDate(hTimeFrame, firstCandleDate, maxPeriod);
  let firstIndexFromStart1 = candles.findIndex(
    (candle) =>
      candle.closeTime + 1 - minutes(interval) * 60 * 1000 === firstDate
  );
  let firstIndexFromEnd1 = -(candles.length - firstIndexFromStart1);
  let analysis = calculatePoints(candles, options).slice(firstIndexFromEnd1);

  let firstIndexFromStart2 = higherTimeFrameCandles.findIndex(
    (candle) =>
      candle.closeTime + 1 - minutes(hInterval) * 60 * 1000 === firstDate
  );
  let firstIndexFromEnd2 = -(
    higherTimeFrameCandles.length - firstIndexFromStart2
  );
  let analysisHigherTimeFrame = calculatePoints(
    higherTimeFrameCandles,
    options
  ).slice(firstIndexFromEnd2);
  analysisHigherTimeFrame = changeResolution(
    analysisHigherTimeFrame,
    analysis,
    higherTimeFrame(interval)
  );

  const curResult =
    (analysisHigherTimeFrame[analysisHigherTimeFrame.length - 1] *
      calculate(interval) +
      analysis[analysis.length - 1]) /
    (calculate(interval) + 1);
  const prevResult =
    (analysisHigherTimeFrame[analysisHigherTimeFrame.length - 2] *
      calculate(interval) +
      analysis[analysis.length - 2]) /
    (calculate(interval) + 1);

  return curResult < 0 && prevResult > 0;
};
