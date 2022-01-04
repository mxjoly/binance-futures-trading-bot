import { OrderSide } from 'binance-api-node';
import { decimalFloor } from '../../utils';

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
  const { profitTargets, lossTolerances } = tradeConfig;
  const currentPrice = candles[candles.length - 1].close;

  let takeProfits = profitTargets
    ? profitTargets.map(({ deltaPercentage, quantityPercentage }) => {
        if (deltaPercentage)
          return {
            price: decimalFloor(
              side === OrderSide.BUY
                ? currentPrice * (1 + deltaPercentage)
                : currentPrice * (1 - deltaPercentage),
              pricePrecision
            ),
            quantityPercentage: quantityPercentage,
          };
      })
    : [];

  let stopLosses = lossTolerances
    ? lossTolerances.map(({ deltaPercentage, quantityPercentage }) => {
        if (deltaPercentage)
          return {
            price: decimalFloor(
              side === OrderSide.BUY
                ? currentPrice * (1 - deltaPercentage)
                : currentPrice * (1 + deltaPercentage),
              pricePrecision
            ),
            quantityPercentage: quantityPercentage,
          };
      })
    : [];

  return { takeProfits, stopLosses };
};
