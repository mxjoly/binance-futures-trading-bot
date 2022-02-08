import { OrderSide } from 'binance-api-node';
import { decimalFloor } from '../../utils';

const strategy: TPSLStrategy = ({
  price,
  candles,
  tradeConfig,
  pricePrecision,
  side,
}) => {
  const { profitTargets, lossTolerances } = tradeConfig;

  let takeProfits = profitTargets
    ? profitTargets
        .filter(
          (profitTarget) =>
            profitTarget.deltaPercentage && !profitTarget.fibonacciLevel
        )
        .map(({ deltaPercentage, quantityPercentage }) => {
          if (deltaPercentage)
            return {
              price: decimalFloor(
                side === OrderSide.BUY
                  ? price * (1 + deltaPercentage)
                  : price * (1 - deltaPercentage),
                pricePrecision
              ),
              quantityPercentage: quantityPercentage,
            };
        })
    : [];

  let stopLosses = lossTolerances
    ? lossTolerances
        .filter(
          (lossTolerance) =>
            lossTolerance.deltaPercentage && !lossTolerance.fibonacciLevel
        )
        .map(({ deltaPercentage, quantityPercentage }) => {
          if (deltaPercentage)
            return {
              price: decimalFloor(
                side === OrderSide.BUY
                  ? price * (1 - deltaPercentage)
                  : price * (1 + deltaPercentage),
                pricePrecision
              ),
              quantityPercentage: quantityPercentage,
            };
        })
    : [];

  return { takeProfits, stopLosses };
};

export default strategy;
