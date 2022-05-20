import { ExchangeInfo, OrderSide } from 'binance-api-node';
import { getTickSize } from '../../utils/currencyInfo';
import { decimalCeil, decimalFloor } from '../../utils/math';

interface Options {
  profitTargets?: BuySellProperty[];
  lossTolerance?: number;
}

const strategy = (
  price: number,
  candles: CandleData[],
  pricePrecision: number,
  side: OrderSide,
  exchangeInfo: ExchangeInfo,
  options: Options
) => {
  let tickSize = getTickSize(candles[0].symbol, exchangeInfo);

  let takeProfits = tickSize
    ? options.profitTargets
        .filter(
          (profitTarget) =>
            profitTarget.deltaPercentage && !profitTarget.fibonacciLevel
        )
        .map(({ deltaPercentage, quantityPercentage }) => {
          if (deltaPercentage) {
            let tpTicks =
              (price * (1 + deltaPercentage) - price) / tickSize / 10;
            return {
              price:
                side === OrderSide.BUY
                  ? decimalFloor(price + tpTicks, pricePrecision)
                  : decimalCeil(price - tpTicks, pricePrecision),
              quantityPercentage: quantityPercentage,
            };
          }
        })
    : [];

  let slTicks = (price * (1 + options.lossTolerance) - price) / tickSize / 10;

  let stopLoss = options.lossTolerance
    ? side === OrderSide.BUY
      ? decimalCeil(price - slTicks, pricePrecision)
      : decimalFloor(price + slTicks, pricePrecision)
    : null;

  return { takeProfits, stopLoss };
};

export default strategy;
