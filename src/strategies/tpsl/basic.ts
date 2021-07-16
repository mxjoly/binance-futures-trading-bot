import { decimalCeil } from '../../utils';

export default ({
  candles,
  tradeConfig,
  pricePrecision,
  side,
}: {
  candles: ChartCandle[];
  tradeConfig?: TradeConfig;
  pricePrecision?: number;
  side: 'BUY' | 'SELL';
}) => {
  const { profitTarget, lossTolerance, leverage } = tradeConfig;
  const currentPrice = candles[candles.length - 1].close;

  const takeProfitPrice = profitTarget
    ? decimalCeil(
        side === 'BUY'
          ? currentPrice * (1 + profitTarget)
          : currentPrice * (1 - profitTarget),
        pricePrecision
      )
    : null;
  const stopLossPrice = lossTolerance
    ? decimalCeil(
        side === 'BUY'
          ? currentPrice * (1 - lossTolerance)
          : currentPrice * (1 + lossTolerance),
        pricePrecision
      )
    : null;

  return { takeProfitPrice, stopLossPrice };
};
