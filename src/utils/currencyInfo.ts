import { ExchangeInfo } from 'binance-api-node';
import { decimalCeil } from './math';

/**
 * @see https://github.com/binance/binance-spot-api-docs/blob/master/rest-api.md#lot_size
 */
export function isValidQuantity(
  quantity: number,
  pair: string,
  exchangeInfo: ExchangeInfo
) {
  const rules = getLotSizeQuantityRules(pair, exchangeInfo);
  return (
    Math.abs(quantity) >= rules.minQty && Math.abs(quantity) <= rules.maxQty
  );
}

/**
 * Get the minimal quantity to trade with this pair according to the
 * Binance futures trading rules
 */
export function getMinOrderQuantity(
  asset: string,
  base: string,
  basePrice: number,
  exchangeInfo: ExchangeInfo
) {
  const precision = getQuantityPrecision(asset + base, exchangeInfo);
  const minimumNotionalValue = 5; // threshold in USDT
  return decimalCeil(minimumNotionalValue / basePrice, precision);
}

/**
 * Get the quantity rules to make a valid order
 * @see https://github.com/binance/binance-spot-api-docs/blob/master/rest-api.md#lot_size
 * @see https://www.binance.com/en/support/faq/360033161972
 */
export function getLotSizeQuantityRules(
  pair: string,
  exchangeInfo: ExchangeInfo
) {
  // @ts-ignore
  const { minQty, maxQty, stepSize } = exchangeInfo.symbols
    .find((symbol) => symbol.symbol === pair)
    // @ts-ignore
    .filters.find((filter) => filter.filterType === 'LOT_SIZE');

  return {
    minQty: Number(minQty),
    maxQty: Number(maxQty),
    stepSize: Number(stepSize),
  };
}

/**
 * Get the maximal number of decimals for a pair quantity
 */
export function getQuantityPrecision(pair: string, exchangeInfo: ExchangeInfo) {
  const symbol = exchangeInfo.symbols.find((symbol) => symbol.symbol === pair);
  // @ts-ignore
  return symbol.quantityPrecision as number;
}

/**
 * Get the maximal number of decimals for a pair quantity
 */
export function getPricePrecision(pair: string, exchangeInfo: ExchangeInfo) {
  return getTickSizePrecision(pair, exchangeInfo);
  // return symbol.pricePrecision as number;
}

/**
 * Get the tick size for a symbol
 */
export function getTickSizePrecision(pair: string, exchangeInfo: ExchangeInfo) {
  const symbol = exchangeInfo.symbols.find((symbol) => symbol.symbol === pair);
  const filter = symbol.filters.find((f) => f.filterType === 'PRICE_FILTER');
  // @ts-ignore
  const tickSize = Number(filter.tickSize); // remove 0 at the right of decimals

  if (tickSize.toString().split('.').length > 0) {
    return tickSize.toString().split('.')[1].length;
  } else {
    return 0;
  }
}
