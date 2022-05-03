import { EMA, SMA } from 'technicalindicators';
import { getCandleSourceType } from '../../utils/loadCandleData';

interface Options {
  sourceType?: SourceType;
  fastLength?: number;
  slowLength?: number;
  signalLength?: number;
  oscillatorMaType?: 'SMA' | 'EMA';
  signalMaType?: 'SMA' | 'EMA';
}

const defaultOptions: Options = {
  sourceType: 'close',
  fastLength: 12,
  slowLength: 26,
  signalLength: 9,
  oscillatorMaType: 'EMA',
  signalMaType: 'EMA',
};

export function calculate(candles: CandleData[], options?: Options) {
  options = { ...defaultOptions, ...options };
  let values = getCandleSourceType(candles, options.sourceType);
  let length = values.length - Math.max(options.fastLength, options.slowLength);

  let fastMa: number[] = [];
  let slowMa: number[] = [];
  let signal: number[] = [];

  if (options.oscillatorMaType === 'SMA') {
    fastMa = SMA.calculate({
      period: options.fastLength,
      values,
    }).slice(-length);
    slowMa = SMA.calculate({
      period: options.slowLength,
      values,
    }).slice(-length);
  } else {
    fastMa = EMA.calculate({
      period: options.fastLength,
      values,
    }).slice(-length);
    slowMa = EMA.calculate({
      period: options.slowLength,
      values,
    }).slice(-length);
  }

  let macd: number[] = new Array(length);
  for (let i = 0; i < length; i++) {
    macd[i] = fastMa[i] - slowMa[i];
  }

  if (options.signalMaType === 'SMA') {
    signal = SMA.calculate({ period: options.signalLength, values: macd });
  } else {
    signal = EMA.calculate({ period: options.signalLength, values: macd });
  }

  let commonLength = Math.min(macd.length, signal.length);
  macd = macd.slice(-commonLength);
  signal = signal.slice(-commonLength);

  let result: { macd: number; signal: number }[] = [];
  for (let i = 0; i < commonLength; i++) {
    result[i] = { macd: macd[i], signal: signal[i] };
  }

  return result;
}
