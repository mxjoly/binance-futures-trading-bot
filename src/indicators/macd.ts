import { EMA, SMA } from 'technicalindicators';

interface Options {
  sourceType: 'close' | 'open' | 'high' | 'low';
  fastLength: number;
  slowLength: number;
  signalLength: number;
  oscillatorMaType: 'SMA' | 'EMA';
  signalMaType: 'SMA' | 'EMA';
}

const defaultOptions: Options = {
  sourceType: 'close',
  fastLength: 12,
  slowLength: 26,
  signalLength: 9,
  oscillatorMaType: 'EMA',
  signalMaType: 'EMA',
};

export function calculate(candles: CandleData[], options = defaultOptions) {
  let sources = candles.map((c) => {
    switch (options.sourceType) {
      case 'close':
        return c.close;
      case 'open':
        return c.open;
      case 'high':
        return c.high;
      case 'low':
        return c.low;
      default:
        return c.close;
    }
  });

  let length =
    candles.length - Math.max(options.fastLength, options.slowLength);

  let fastMa = [];
  let slowMa = [];
  let signal = [];

  if (options.oscillatorMaType === 'SMA') {
    fastMa = SMA.calculate({
      period: options.fastLength,
      values: sources,
    }).slice(-length);
    slowMa = SMA.calculate({
      period: options.slowLength,
      values: sources,
    }).slice(-length);
  } else {
    fastMa = EMA.calculate({
      period: options.fastLength,
      values: sources,
    }).slice(-length);
    slowMa = EMA.calculate({
      period: options.slowLength,
      values: sources,
    }).slice(-length);
  }

  let macd = new Array(length);
  for (let i = 0; i < length; i++) {
    macd[i] = fastMa[i] - slowMa[i];
  }

  if (options.signalMaType === 'SMA') {
    signal = SMA.calculate({ period: options.signalLength, values: macd });
  } else {
    signal = EMA.calculate({ period: options.signalLength, values: macd });
  }

  return { macd, signal };
}
