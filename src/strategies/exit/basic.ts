import { ExchangeInfo, OrderSide } from 'binance-api-node';
import { decimalFloor } from '../../utils/math';

interface Options {
  profitTargets?: BuySellProperty[];
  lossTolerance?: number;
}

const defaultOptions: Options = {};

const strategy = (
  price: number,
  pricePrecision: number,
  side: OrderSide,
  exchangeInfo: ExchangeInfo,
  options = defaultOptions
) => {
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
