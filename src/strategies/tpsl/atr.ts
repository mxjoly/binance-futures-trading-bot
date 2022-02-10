import { OrderSide } from 'binance-api-node';
import { decimalFloor } from '../../utils';
import { ATR } from 'technicalindicators';

interface Options {
  takeProfitAtrRatio?: number;
  stopLossAtrRatio?: number;
}

const defaultOptions: Options = {
  takeProfitAtrRatio: 2,
  stopLossAtrRatio: 3,
};

const strategy = (
  price,
  candles,
  pricePrecision,
  side,
  options = defaultOptions
) => {
  const atr = ATR.calculate({
    period: 14,
    close: candles.map((c) => c.close),
    low: candles.map((c) => c.close),
    high: candles.map((c) => c.close),
  });

  return {
    takeProfits: [
      {
        price: decimalFloor(
          side === OrderSide.BUY
            ? price + options.takeProfitAtrRatio * atr[atr.length - 1]
            : price - options.takeProfitAtrRatio * atr[atr.length - 1],
          pricePrecision
        ),
        quantityPercentage: 1,
      },
    ],
    stopLosses: [
      {
        price: decimalFloor(
          side === OrderSide.BUY
            ? price - options.stopLossAtrRatio * atr[atr.length - 1]
            : price + options.stopLossAtrRatio * atr[atr.length - 1],
          pricePrecision
        ),
        quantityPercentage: 1,
      },
    ],
  };
};

export default strategy;
