import {} from 'technicalindicators';
import { getCandleSourceType } from '../../utils/loadCandleData';

interface Options {
  sourceType?: SourceType;
}

const defaultOptions: Options = {
  sourceType: 'high',
};

export function calculate(candles: CandleData[], options?: Options) {
  options = { ...defaultOptions, ...options };
  let values = getCandleSourceType(candles, options.sourceType);

  let hilbertTransformation = new Array(values.length - 6);
  for (let i = 6; i < values.length; i++) {
    hilbertTransformation[i - 6] =
      0.0962 * values[i] +
      0.5769 * values[i - 2] -
      0.5769 * values[i - 4] -
      0.0962 * values[i - 6];
  }

  
}
