import { decimalCeil } from '../../utils';

export default ({
  candles,
  tradeConfig,
  side,
  pricePrecision,
}: {
  candles: ChartCandle[];
  tradeConfig?: TradeConfig;
  pricePrecision?: number;
  side: 'BUY' | 'SELL';
}) => {
  const lastCandle = candles[candles.length - 1];
  const [risk, reward] = tradeConfig.riskReward
    ? tradeConfig.riskReward.split(':').map((n) => Number(n))
    : [1, 2];

  const bodyHigh = Math.max(lastCandle.close, lastCandle.open);
  const bodyLow = Math.min(lastCandle.close, lastCandle.open);
  const body = bodyHigh - bodyLow;

  const stopLossPrice = lastCandle.open;
  const takeProfitPrice = decimalCeil(
    side === 'BUY'
      ? stopLossPrice + body + (reward * body) / risk
      : stopLossPrice - body - (reward * body) / risk,
    pricePrecision
  );

  return { takeProfitPrice, stopLossPrice };
};
