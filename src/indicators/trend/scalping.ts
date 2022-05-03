import { HeikinAshi, EMA } from 'technicalindicators';

interface Options {
  emaScalpingLength?: number;
  fastEMAlength?: number;
  mediumEMAlength?: number;
  slowEMAlength?: number;
  lookBack?: number;
  useHeikinAshiCandles?: boolean;
}

const defaultOptions: Options = {
  emaScalpingLength: 3,
  fastEMAlength: 10,
  mediumEMAlength: 120,
  slowEMAlength: 250,
  lookBack: 12,
  useHeikinAshiCandles: true,
};

export function calculate(candles: CandleData[], options?: Options) {
  options = { ...defaultOptions, ...options };
  let close: number[], open: number[], high: number[], low: number[];

  if (options.useHeikinAshiCandles) {
    let heikinAshi = HeikinAshi.calculate({
      open: candles.map((c) => c.open),
      high: candles.map((c) => c.high),
      low: candles.map((c) => c.low),
      close: candles.map((c) => c.close),
    });
    close = heikinAshi.close;
    open = heikinAshi.open;
    high = heikinAshi.high;
    low = heikinAshi.low;
  } else {
    close = candles.map((c) => c.close);
    open = candles.map((c) => c.open);
    high = candles.map((c) => c.high);
    low = candles.map((c) => c.low);
  }

  let fastEma = EMA.calculate({
    period: options.fastEMAlength,
    values: close,
  });
  let mediumEma = EMA.calculate({
    period: options.mediumEMAlength,
    values: close,
  });
  let slowEma = EMA.calculate({
    period: options.slowEMAlength,
    values: close,
  });

  let priceActionClose = EMA.calculate({
    period: options.emaScalpingLength,
    values: close,
  });
  let priceActionLow = EMA.calculate({
    period: options.emaScalpingLength,
    values: low,
  });
  let priceActionHigh = EMA.calculate({
    period: options.emaScalpingLength,
    values: high,
  });

  let normalizedLength = Math.min(
    fastEma.length,
    mediumEma.length,
    slowEma.length,
    priceActionClose.length
  );

  // Normalize the arrays
  fastEma = fastEma.slice(-normalizedLength);
  mediumEma = mediumEma.slice(-normalizedLength);
  slowEma = slowEma.slice(-normalizedLength);
  close = close.slice(-normalizedLength);
  open = open.slice(-normalizedLength);
  high = high.slice(-normalizedLength);
  low = low.slice(-normalizedLength);
  priceActionClose = priceActionClose.slice(-normalizedLength);
  priceActionLow = priceActionLow.slice(-normalizedLength);
  priceActionHigh = priceActionHigh.slice(-normalizedLength);

  let trendDirection = [];
  for (let i = 0; i < normalizedLength; i++) {
    trendDirection[i] =
      fastEma[i] > mediumEma[i] && priceActionLow[i] > mediumEma[i]
        ? 1
        : fastEma[i] < mediumEma[i] && priceActionHigh[i] < mediumEma[i]
        ? -1
        : 0;
  }

  const numberBarsSince = (
    a: number[],
    b: number[],
    condition: (a: number, b: number) => boolean
  ) => {
    let l = Math.min(a.length, b.length);
    let i = l - 1;
    let n = 0;
    while (i >= 0 && !condition(a[i], b[i])) {
      i--;
      n++;
    }
    return n;
  };

  let tradeDirection: number[] = new Array(normalizedLength).fill(0);

  for (let i = 1; i < normalizedLength; i++) {
    tradeDirection[i] = tradeDirection[i - 1];

    let priceActionExitHigh =
      open[i] < priceActionHigh[i] &&
      close[i] > priceActionHigh[i] &&
      numberBarsSince(
        close.slice(0, i + 1),
        priceActionClose.slice(0, i + 1),
        (a, b) => a < b
      ) <= options.lookBack;

    let priceActionExitLow =
      open[i] > priceActionLow[i] &&
      close[i] < priceActionLow[i] &&
      numberBarsSince(
        close.slice(0, i + 1),
        priceActionClose.slice(0, i + 1),
        (a, b) => a > b
      ) <= options.lookBack;

    let buy = trendDirection[i] === 1 && priceActionExitHigh;
    let sell = trendDirection[i] === -1 && priceActionExitLow;

    tradeDirection[i] =
      tradeDirection[i] === 1 && close[i] < priceActionClose[i]
        ? 0
        : tradeDirection[i] === -1 && close[i] > priceActionClose[i]
        ? 0
        : tradeDirection[i] === 0 && buy
        ? 1
        : tradeDirection[i] === 0 && sell
        ? -1
        : tradeDirection[i];
  }

  return tradeDirection;
}
