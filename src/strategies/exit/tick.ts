import { ExchangeInfo, OrderSide } from 'binance-api-node';
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
  let tickSize = exchangeInfo.symbols
    .filter((f) => f.symbol === candles[0].symbol)[0]
    // @ts-ignore
    .filters.filter((f) => f.filterType === 'PRICE_FILTER')[0].tickSize;

  let n = process.env.NODE_ENV === 'production' ? 100 : 10;

  let takeProfits = tickSize
    ? options.profitTargets
        .filter(
          (profitTarget) =>
            profitTarget.deltaPercentage && !profitTarget.fibonacciLevel
        )
        .map(({ deltaPercentage, quantityPercentage }) => {
          if (deltaPercentage) {
            let tpTicks =
              (price * (1 + deltaPercentage) - price) / Number(tickSize) / n;
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

  let slTicks =
    (price * (1 + options.lossTolerance) - price) / Number(tickSize) / n;

  let stopLoss = options.lossTolerance
    ? side === OrderSide.BUY
      ? decimalCeil(price - slTicks, pricePrecision)
      : decimalFloor(price + slTicks, pricePrecision)
    : null;

  return { takeProfits, stopLoss };
};

export default strategy;
