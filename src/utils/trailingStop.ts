import { decimalFloor } from './math';

/**
 * // Calculate the activation price for the trailing stop according tot the trailing stop configuration
 * @param trailingStopConfig
 * @param currentPrice
 * @param pricePrecision
 * @param takeProfits
 */
export const calculateActivationPrice = (
  trailingStopConfig: TrailingStopConfig,
  currentPrice: number,
  pricePrecision: number,
  takeProfits: TakeProfit[]
) => {
  let { percentageToTP, changePercentage } = trailingStopConfig.activation;

  if (takeProfits.length > 0 && percentageToTP) {
    const nearestTakeProfitPrice = Math.min(
      ...takeProfits.map((tp) => tp.price)
    );
    let delta = Math.abs(nearestTakeProfitPrice - currentPrice);
    return decimalFloor(currentPrice + delta * percentageToTP, pricePrecision);
  } else if (changePercentage) {
    return decimalFloor(currentPrice * (1 + changePercentage), pricePrecision);
  } else {
    return currentPrice;
  }
};
