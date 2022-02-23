import { BINANCE_MODE } from '../';
import {
  getQuantityPrecision,
  getLotSizeQuantityRules,
  getMinOrderQuantity,
} from '../utils/rules';
import { decimalCeil } from '../utils/math';

/**
 * Calculate the quantity of crypto to buy according to your available balance,
 * the allocation you want, and the current price of the crypto
 */
export function getPositionSizeByPercent({
  asset,
  base,
  balance,
  risk,
  enterPrice,
  exchangeInfo,
}: RiskManagementOptions) {
  let pair = asset + base;
  let quantityPrecision = getQuantityPrecision(pair, exchangeInfo);
  let quantity = (balance * risk) / enterPrice;

  let minQuantity =
    BINANCE_MODE === 'spot'
      ? getLotSizeQuantityRules(pair, exchangeInfo).minQty
      : getMinOrderQuantity(asset, enterPrice, exchangeInfo);

  return quantity > minQuantity
    ? decimalCeil(quantity, quantityPrecision)
    : decimalCeil(minQuantity, quantityPrecision);
}

/**
 * Calculate the quantity of crypto to buy according to the risk
 */
export function getPositionSizeByRisk({
  asset,
  base,
  balance,
  risk,
  enterPrice,
  stopLossPrice,
  exchangeInfo,
}: RiskManagementOptions) {
  if (!stopLossPrice) {
    return getPositionSizeByPercent({
      asset,
      base,
      balance,
      risk,
      enterPrice,
      exchangeInfo,
    });
  }
  let pair = asset + base;
  let quantityPrecision = getQuantityPrecision(pair, exchangeInfo);
  let riskBalance = balance * risk;
  let delta = Math.abs(stopLossPrice - enterPrice) / enterPrice;
  let quantity = riskBalance / delta / enterPrice;

  let minQuantity =
    BINANCE_MODE === 'spot'
      ? getLotSizeQuantityRules(pair, exchangeInfo).minQty
      : getMinOrderQuantity(asset, enterPrice, exchangeInfo);

  return quantity > minQuantity
    ? decimalCeil(quantity, quantityPrecision)
    : decimalCeil(minQuantity, quantityPrecision);
}
