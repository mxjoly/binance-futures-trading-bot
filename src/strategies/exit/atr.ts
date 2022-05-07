import { ExchangeInfo, OrderSide } from 'binance-api-node';
import { decimalCeil, decimalFloor } from '../../utils/math';
import { ATR } from 'technicalindicators';

interface Options {
  takeProfitAtrRatio?: number;
  stopLossAtrRatio?: number;
  atrPeriod?: number;
  atrMultiplier?: number;
}

const defaultOptions: Options = {
  takeProfitAtrRatio: 2,
  stopLossAtrRatio: 3,
  atrPeriod: 14,
  atrMultiplier: 3,
};

const strategy = (
  price: number,
  candles: CandleData[],
  pricePrecision: number,
  side: OrderSide,
  exchangeInfo: ExchangeInfo,
  options = defaultOptions
) => {
  const atr = ATR.calculate({
    period: options.atrPeriod,
    close: candles.map((c) => c.close),
    low: candles.map((c) => c.low),
    high: candles.map((c) => c.high),
  });

  let takeProfits = options.takeProfitAtrRatio
    ? [
        {
          price:
            side === OrderSide.BUY
              ? decimalFloor(
                  price +
                    options.takeProfitAtrRatio *
                      atr[atr.length - 1] *
                      options.atrMultiplier,
                  pricePrecision
                )
              : decimalCeil(
                  price -
                    options.takeProfitAtrRatio *
                      atr[atr.length - 1] *
                      options.atrMultiplier,
                  pricePrecision
                ),
          quantityPercentage: 1,
        },
      ]
    : [];

  let stopLoss = options.stopLossAtrRatio
    ? side === OrderSide.BUY
      ? decimalCeil(
          price -
            options.stopLossAtrRatio *
              atr[atr.length - 1] *
              options.atrMultiplier,
          pricePrecision
        )
      : decimalFloor(
          price +
            options.stopLossAtrRatio *
              atr[atr.length - 1] *
              options.atrMultiplier,
          pricePrecision
        )
    : null;

  return { takeProfits, stopLoss };
};

export default strategy;
