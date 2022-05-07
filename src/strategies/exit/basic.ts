import { ExchangeInfo, OrderSide } from 'binance-api-node';
import { decimalCeil, decimalFloor } from '../../utils/math';

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
              price:
                side === OrderSide.BUY
                  ? decimalFloor(price * (1 + deltaPercentage), pricePrecision)
                  : decimalCeil(price * (1 - deltaPercentage), pricePrecision),
              quantityPercentage,
            };
        })
    : [];

  let stopLoss = options.lossTolerance
    ? side === OrderSide.BUY
      ? decimalCeil(price * (1 - options.lossTolerance), pricePrecision)
      : decimalFloor(price * (1 + options.lossTolerance), pricePrecision)
    : null;

  return { takeProfits, stopLoss };
};

export default strategy;
