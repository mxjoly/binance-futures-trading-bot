import { Supertrend } from '../../indicators';

export function getTrend(candles: CandleData[]) {
  const result = Supertrend.calculate({ candles });
  return result[result.length - 1].trend === 1 ? 1 : -1;
}
