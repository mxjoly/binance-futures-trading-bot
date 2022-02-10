import { OrderSide } from 'binance-api-node';
import { decimalFloor } from '../../utils';

interface Options {
  profitTargets?: BuySellProperty[];
  lossTolerances?: BuySellProperty[];
}

const defaultOptions: Options = {};

const strategy = (price, pricePrecision, side, options = defaultOptions) => {
  let takeProfits = options.profitTargets
    ? options.profitTargets
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

  let stopLosses = options.lossTolerances
    ? options.lossTolerances
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
