import { SMA, SD } from 'technicalindicators';
import { getCandleSourceType } from '../../utils/loadCandleData';

interface Options {
  sourceType?: SourceType;
  period?: number;
  multiplier?: number;
}

const defaultOptions: Options = {
  sourceType: 'close',
  period: 14,
  multiplier: 2.0,
};

export function calculate(candles, options?: Options) {
  options = { ...defaultOptions, ...options };
  let values = getCandleSourceType(candles, options.sourceType);

  let basis = SMA.calculate({ values, period: options.period });
  let dev = SD.calculate({ values, period: options.period }).map(
    (v) => v * options.multiplier
  );

  let commonLength = Math.min(basis.length, dev.length);
  basis = basis.slice(-commonLength);
  dev = dev.slice(-commonLength);

  let result: {
    basis: number;
    upper: number;
    lower: number;
    spread: number;
  }[] = new Array(commonLength);
  for (let i = 0; i < commonLength; i++) {
    result[i] = {
      basis: basis[i],
      upper: basis[i] + dev[i],
      lower: basis[i] - dev[i],
      spread: 2 * dev[i],
    };
  }

  return result;
}
