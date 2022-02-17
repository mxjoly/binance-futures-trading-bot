import { Candle, CandleChartResult, ExchangeInfo } from 'binance-api-node';

export const buildCandle = (
  candle: Candle | CandleChartResult
): ChartCandle => ({
  open: Number(candle.open),
  high: Number(candle.high),
  low: Number(candle.low),
  close: Number(candle.close),
  volume: Number(candle.volume),
});

/**
 * @see https://github.com/binance/binance-spot-api-docs/blob/master/rest-api.md#lot_size
 */
export function isValidQuantity(
  quantity: number,
  pair: string,
  exchangeInfo: ExchangeInfo
) {
  const rules = getLotSizeQuantityRules(pair, exchangeInfo);
  return quantity >= rules.minQty && quantity <= rules.maxQty;
}

/**
 * Get the minimal quantity to trade with this pair according to the
 * Binance futures trading rules
 */
export function getMinOrderQuantity(
  asset: string,
  usdtPrice: number,
  exchangeInfo: ExchangeInfo
) {
  const precision = getQuantityPrecision(`${asset}USDT`, exchangeInfo);
  const minimumNotionalValue = 5; // threshold in USDT
  return decimalCeil(minimumNotionalValue / usdtPrice, precision);
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
  const symbol = exchangeInfo.symbols.find((symbol) => symbol.symbol === pair);
  // @ts-ignore
  return symbol.pricePrecision as number;
}

/**
 * Math.ceil with decimals
 * @param a
 * @param precision - The number of decimals after the comma
 */
export function decimalCeil(x: number, precision: number) {
  return Math.ceil(x * Math.pow(10, precision)) / Math.pow(10, precision);
}

/**
 * Math.floor with decimals
 * @param a
 * @param precision - The number of decimals after the comma
 */
export function decimalFloor(x: number, precision: number) {
  return Math.floor(x * Math.pow(10, precision)) / Math.pow(10, precision);
}
