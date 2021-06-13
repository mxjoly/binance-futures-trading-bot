import { decimalCeil } from '../../utils';

export default ({
  candles,
  side,
  pricePrecision,
}: {
  candles: ChartCandle[];
  tradeConfig?: TradeConfig;
  pricePrecision?: number;
  side: 'BUY' | 'SELL';
}) => {
  const lastCandle = candles[candles.length - 1];

  const bodyHigh = Math.max(lastCandle.close, lastCandle.open);
  const bodyLow = Math.min(lastCandle.close, lastCandle.open);
  const body = bodyHigh - bodyLow;

  const stopLossPrice = lastCandle.open;
  const takeProfitPrice = decimalCeil(
    side === 'BUY' ? stopLossPrice + 2 * body : stopLossPrice - 2 * body,
    pricePrecision
  );

  return { takeProfitPrice, stopLossPrice };
};
