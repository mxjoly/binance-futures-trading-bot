import { OrderSide } from 'binance-api-node';
import { decimalFloor } from '../../utils';

interface Options {
  profitTargets?: {
    deltaPercentage?: number; // Percentage of rise or fall to buy/sell
    fibonacciLevel?: FibonacciRetracementLevel | FibonacciExtensionLevel;
    quantityPercentage: number; // percentage between 0 and 1 for the quantity of tokens to buy/sell
  }[];
  lossTolerance?: number;
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

  let stopLoss = decimalFloor(
    side === OrderSide.BUY
      ? price * (1 - options.lossTolerance)
      : price * (1 + options.lossTolerance),
    pricePrecision
  );

  return { takeProfits, stopLoss };
};

export default strategy;
