import { Supertrend } from '../../indicators';

export function getTrend(candles: CandleData[]) {
  const results = Supertrend.calculate({ candles });
  if (results.length > 0) {
    return results[results.length - 1].trend === 1 ? 1 : -1;
  } else {
    return 0;
  }
}
