import { EMA, SMA } from 'technicalindicators';

interface Options {
  values: number[];
  fastLength: number;
  slowLength: number;
  signalLength: number;
  oscillatorMaType: 'SMA' | 'EMA';
  signalMaType: 'SMA' | 'EMA';
}

const defaultOptions = {
  fastLength: 12,
  slowLength: 26,
  signalLength: 9,
  oscillatorMaType: 'EMA',
  signalMaType: 'EMA',
};

export function calculate({
  values,
  fastLength = defaultOptions.fastLength,
  slowLength = defaultOptions.slowLength,
  signalLength = defaultOptions.signalLength,
  oscillatorMaType = 'EMA',
  signalMaType = 'EMA',
}: Options) {
  let length = values.length - Math.max(fastLength, slowLength);

  let fastMa = [];
  let slowMa = [];
  let signal = [];

  if (oscillatorMaType === 'SMA') {
    fastMa = SMA.calculate({
      period: fastLength,
      values,
    }).slice(-length);
    slowMa = SMA.calculate({
      period: slowLength,
      values,
    }).slice(-length);
  } else {
    fastMa = EMA.calculate({
      period: fastLength,
      values,
    }).slice(-length);
    slowMa = EMA.calculate({
      period: slowLength,
      values,
    }).slice(-length);
  }

  let macd = new Array(length);
  for (let i = 0; i < length; i++) {
    macd[i] = fastMa[i] - slowMa[i];
  }

  if (signalMaType === 'SMA') {
    signal = SMA.calculate({ period: signalLength, values: macd });
  } else {
    signal = EMA.calculate({ period: signalLength, values: macd });
  }

  return { macd, signal };
}
