import { OrderSide } from 'binance-api-node';
import { decimalCeil, decimalFloor } from './math';

/**
 * // Calculate the activation price for the trailing stop according tot the trailing stop configuration
 * @param trailingStopConfig
 * @param currentPrice
 * @param pricePrecision
 * @param takeProfits
 */
export const calculateActivationPrice = (
  currentPrice: number,
  pricePrecision: number,
  side: OrderSide,
  trailingStopConfig?: TrailingStopConfig,
  takeProfits?: TakeProfit[]
) => {
  if (!trailingStopConfig) return currentPrice;

  let { percentageToTP, changePercentage } = trailingStopConfig.activation;

  if (takeProfits && takeProfits.length > 0 && percentageToTP) {
    const nearestTakeProfitPrice = Math.min(
      ...takeProfits.map((tp) => tp.price)
    );
    let delta = Math.abs(nearestTakeProfitPrice - currentPrice);
    if (side === OrderSide.BUY) {
      return decimalFloor(
        currentPrice - delta * percentageToTP,
        pricePrecision
      );
    } else {
      return decimalCeil(currentPrice + delta * percentageToTP, pricePrecision);
    }
  } else if (changePercentage) {
    if (side === OrderSide.BUY) {
      return decimalFloor(
        currentPrice * (1 - changePercentage),
        pricePrecision
      );
    } else {
      return decimalFloor(
        currentPrice * (1 + changePercentage),
        pricePrecision
      );
    }
  } else {
    return currentPrice;
  }
};
