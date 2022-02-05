import { OrderSide } from 'binance-api-node';
import { decimalFloor, decimalCeil } from '../../utils';

const strategy: TPSLStrategy = ({
  price,
  candles,
  tradeConfig,
  pricePrecision,
  side,
  riskRewardRatio,
}) => {
  const lastCandle = candles[candles.length - 1];

  if (side === OrderSide.BUY) {
    const delta = lastCandle.close - lastCandle.low;
    return {
      stopLosses: [{ price: lastCandle.low, quantityPercentage: 1 }],
      takeProfits: [
        {
          price: decimalFloor(price + delta * riskRewardRatio, pricePrecision),
          quantityPercentage: 1,
        },
      ],
    };
  }

  if (side === OrderSide.SELL) {
    const delta = lastCandle.high - lastCandle.close;
    return {
      stopLosses: [{ price: lastCandle.high, quantityPercentage: 1 }],
      takeProfits: [
        {
          price: decimalCeil(price - delta * riskRewardRatio, pricePrecision),
          quantityPercentage: 1,
        },
      ],
    };
  }

  return { stopLosses: [], takeProfits: [] };
};

export default strategy;
