import { SMA } from 'technicalindicators';

interface Options {
  atrLength?: number;
}

const defaultOptions: Options = {
  atrLength: 14,
};

export function calculate(candles: CandleData[], options?: Options) {
  options = { ...defaultOptions, ...options };

  let trueRange = new Array(candles.length).fill(0);
  let directionalMovementPlus = new Array(candles.length).fill(0);
  let directionalMovementMinus = new Array(candles.length).fill(0);
  let smoothedTrueRange = new Array(candles.length).fill(0);
  let smoothedDirectionalMovementPlus = new Array(candles.length).fill(0);
  let smoothedDirectionalMovementMinus = new Array(candles.length).fill(0);

  const calculateTrueRange = (curCandle: CandleData, prevCandle: CandleData) =>
    Math.max(
      Math.max(
        curCandle.high - curCandle.low,
        Math.abs(curCandle.high - prevCandle.close)
      ),
      Math.abs(curCandle.low - prevCandle.close)
    );

  const calculateDirectionalMovementPlus = (
    curCandle: CandleData,
    prevCandle: CandleData
  ) =>
    curCandle.high - prevCandle.high > prevCandle.low - curCandle.low
      ? Math.max(curCandle.high - prevCandle.high, 0)
      : 0;

  const calculateDirectionalMovementMinus = (
    curCandle: CandleData,
    prevCandle: CandleData
  ) =>
    prevCandle.low - curCandle.low > curCandle.high - prevCandle.high
      ? Math.max(prevCandle.low - curCandle.low, 0)
      : 0;

  const calculateSmoothedTrueRange = (i: number) =>
    smoothedTrueRange[i - 1] -
    smoothedTrueRange[i - 1] / options.atrLength +
    trueRange[i];

  const calculateSmoothedDirectionalMovementPlus = (i: number) =>
    smoothedDirectionalMovementPlus[i - 1] -
    smoothedDirectionalMovementPlus[i - 1] / options.atrLength +
    directionalMovementPlus[i];

  const calculateSmoothedDirectionalMovementMinus = (i: number) =>
    smoothedDirectionalMovementMinus[i - 1] -
    smoothedDirectionalMovementMinus[i - 1] / options.atrLength +
    directionalMovementMinus[i];

  for (let i = 1; i < candles.length; i++) {
    let curCandle = candles[i];
    let prevCandle = candles[i - 1];

    trueRange[i] = calculateTrueRange(curCandle, prevCandle);
    directionalMovementPlus[i] = calculateDirectionalMovementPlus(
      curCandle,
      prevCandle
    );
    directionalMovementMinus[i] = calculateDirectionalMovementMinus(
      curCandle,
      prevCandle
    );
    smoothedTrueRange[i] = calculateSmoothedTrueRange(i);
    smoothedDirectionalMovementPlus[i] =
      calculateSmoothedDirectionalMovementPlus(i);
    smoothedDirectionalMovementMinus[i] =
      calculateSmoothedDirectionalMovementMinus(i);
  }

  const calculateDIP = (i: number) =>
    (smoothedDirectionalMovementPlus[i] / smoothedTrueRange[i]) * 100;

  const calculateDIM = (i: number) =>
    (smoothedDirectionalMovementMinus[i] / smoothedTrueRange[i]) * 100;

  const calculateDX = (i: number) => {
    let DIP = calculateDIP(i);
    let DIM = calculateDIM(i);
    let DX = (Math.abs(DIP - DIM) / (DIP + DIM)) * 100;
    return isNaN(DX) ? 0 : DX;
  };

  let DIP: number[] = new Array(candles.length).fill(0);
  let DIM: number[] = new Array(candles.length).fill(0);
  let DX: number[] = new Array(candles.length).fill(0);

  for (let i = 0; i < candles.length; i++) {
    DIP[i] = calculateDIP(i);
    DIM[i] = calculateDIM(i);
    DX[i] = calculateDX(i);
  }

  let adx = SMA.calculate({ values: DX, period: options.atrLength });

  DIP = DIP.slice(-adx.length);
  DIM = DIM.slice(-adx.length);
  DX = DX.slice(-adx.length);

  let result: { DIP: number; DIM: number; adx: number }[] = [];
  for (let i = 0; i < adx.length; i++) {
    result[i] = { DIP: DIP[i], DIM: DIM[i], adx: adx[i] };
  }

  return result;
}
