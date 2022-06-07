import { ExchangeInfo, OrderSide } from 'binance-api-node';
import { decimalCeil, decimalFloor } from '../../utils/math';
import { Highest, Lowest } from 'technicalindicators';

interface Options {
  lookBack?: number;
  takeProfitRatio?: number;
  side?: OrderSide;
}

const defaultOptions: Options = {
  lookBack: 14,
  takeProfitRatio: 3,
  side: OrderSide.BUY,
};

const strategy = (
  price: number,
  candles: CandleData[],
  pricePrecision: number,
  side: OrderSide,
  exchangeInfo: ExchangeInfo,
  options = defaultOptions
) => {
  const high = Highest.calculate({
    values: candles.map((c) => c.high),
    period: options.lookBack,
  });
  const low = Lowest.calculate({
    values: candles.map((c) => c.low),
    period: options.lookBack,
  });

  let stopLoss =
    side === OrderSide.BUY ? low[low.length - 1] : high[high.length - 1];

  let takeProfits = [
    {
      price:
        side === OrderSide.BUY
          ? decimalFloor(
              price + options.takeProfitRatio * Math.abs(price - stopLoss),
              pricePrecision
            )
          : decimalCeil(
              price - options.takeProfitRatio * Math.abs(price - stopLoss),
              pricePrecision
            ),
      quantityPercentage: 1,
    },
  ];

  return { takeProfits, stopLoss };
};

export default strategy;
