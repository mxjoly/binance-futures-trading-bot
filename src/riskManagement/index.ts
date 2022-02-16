import { ExchangeInfo } from 'binance-api-node';
import { BINANCE_MODE } from '../bot';
import {
  getQuantityPrecision,
  getLotSizeQuantityRules,
  getMinOrderQuantity,
  decimalCeil,
} from '../utils';

/**
 * Calculate the quantity of crypto to buy according to your available balance,
 * the allocation you want, and the current price of the crypto
 * @param asset
 * @param base
 * @param balance - Your available balance in your wallet
 * @param risk - The % of balance to risk on the trade
 * @param price - The current price of the crypto to buy
 * @param leverage
 * @param exchangeInfo
 */
export function getPositionSizeByPercent(
  asset: string,
  base: string,
  balance: number,
  risk: number,
  price: number,
  leverage: number,
  exchangeInfo: ExchangeInfo
) {
  let pair = asset + base;
  let quantityPrecision = getQuantityPrecision(pair, exchangeInfo);
  let quantity = (balance * risk) / price / leverage;

  let minQuantity =
    BINANCE_MODE === 'spot'
      ? getLotSizeQuantityRules(pair, exchangeInfo).minQty
      : getMinOrderQuantity(asset, price, exchangeInfo);

  return quantity > minQuantity
    ? decimalCeil(quantity, quantityPrecision)
    : decimalCeil(minQuantity / leverage, quantityPrecision);
}

/**
 * Calculate the quantity of crypto to buy according to the risk
 * @param asset
 * @param base
 * @param balance - Your available balance in your wallet
 * @param risk - The % of balance to risk on the trade
 * @param enterPrice - The current price of the crypto to buy
 * @param stopLossPrice - The stop loss price
 * @param leverage
 * @param exchangeInfo
 */
export function getPositionSizeByRisk(
  asset: string,
  base: string,
  balance: number,
  risk: number,
  enterPrice: number,
  stopLossPrice: number,
  leverage: number,
  exchangeInfo: ExchangeInfo
) {
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
    : decimalCeil(minQuantity / leverage, quantityPrecision);
}
