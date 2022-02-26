import { OrderSide } from 'binance-api-node';
import { decimalFloor } from '../../utils/math';
import { ATR } from 'technicalindicators';

interface Options {
  takeProfitAtrRatio?: number;
  stopLossAtrRatio?: number;
  atrPeriod?: number;
}

const defaultOptions: Options = {
  takeProfitAtrRatio: 2,
  stopLossAtrRatio: 3,
  atrPeriod: 14,
};

const strategy = (
  price: number,
  candles: CandleData[],
  pricePrecision: number,
  side: OrderSide,
  options = defaultOptions
) => {
  const atr = ATR.calculate({
    period: options.atrPeriod,
    close: candles.map((c) => c.close),
    low: candles.map((c) => c.close),
    high: candles.map((c) => c.close),
  });

  return {
    takeProfits: options.takeProfitAtrRatio
      ? [
          {
            price: decimalFloor(
              side === OrderSide.BUY
                ? price + options.takeProfitAtrRatio * atr[atr.length - 1]
                : price - options.takeProfitAtrRatio * atr[atr.length - 1],
              pricePrecision
            ),
            quantityPercentage: 1,
          },
        ]
      : [],
    stopLoss: options.stopLossAtrRatio
      ? decimalFloor(
          side === OrderSide.BUY
            ? price - options.stopLossAtrRatio * atr[atr.length - 1]
            : price + options.stopLossAtrRatio * atr[atr.length - 1],
          pricePrecision
        )
      : null,
  };
};

export default strategy;
