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

  function hilbertTransformation(i: number) {
    if (i >= 6) {
      return (
        0.0962 * values[i] +
        0.5769 * values[i - 2] -
        0.5769 * values[i - 4] -
        0.0962 * values[i - 6]
      );
    }
  }

  function computeComponent(i: number, mesaPeriodMult: number) {
    return hilbertTransformation(i) * mesaPeriodMult;
  }
}
