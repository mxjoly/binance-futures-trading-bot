import { OrderSide } from 'binance-api-node';
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
  side: OrderSide;
}) => {
  const { profitTarget, lossTolerance } = tradeConfig;
  const currentPrice = candles[candles.length - 1].close;

  const takeProfitPrice = profitTarget
    ? decimalCeil(
        side === OrderSide.BUY
          ? currentPrice * (1 + profitTarget)
          : currentPrice * (1 - profitTarget),
        pricePrecision
      )
    : null;
  const stopLossPrice = lossTolerance
    ? decimalCeil(
        side === OrderSide.BUY
          ? currentPrice * (1 - lossTolerance)
          : currentPrice * (1 + lossTolerance),
        pricePrecision
      )
    : null;

  return { takeProfitPrice, stopLossPrice };
};
