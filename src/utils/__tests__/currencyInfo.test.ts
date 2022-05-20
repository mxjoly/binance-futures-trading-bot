import { binanceClient } from '../../init';
import { ExchangeInfo } from 'binance-api-node';
import {
  getLotSizeQuantityRules,
  getMinOrderQuantity,
  getPricePrecision,
  getQuantityPrecision,
  getTickSize,
  isValidQuantity,
} from '../currencyInfo';

describe('Currency Info', () => {
  let exchangeInfo: ExchangeInfo;

  beforeAll(async () => {
    exchangeInfo = await binanceClient.futuresExchangeInfo();
  });

  it('isValidQuantity', () => {
    expect(isValidQuantity(1, 'BTCUSDT', exchangeInfo)).toBe(true);
    expect(isValidQuantity(0.0001, 'BTCUSDT', exchangeInfo)).toBe(false);
  });

  it('getMinOrderQuantity', () => {
    let minQty = getMinOrderQuantity('BTC', 'USDT', 30000, exchangeInfo);
    expect(minQty).toBe(0.001);
  });

  it('getLotSizeQuantityRules', () => {
    let rules = getLotSizeQuantityRules('BTCUSDT', exchangeInfo);
    expect(rules.minQty).toBeDefined();
    expect(rules.maxQty).toBeDefined();
    expect(rules.stepSize).toBeDefined();
  });

  it('getPricePrecision', () => {
    let precision = getPricePrecision('BTCUSDT', exchangeInfo);
    expect(precision).toBe(1);
  });

  it('getTickSizePrecision', () => {
    let precision = getTickSize('BTCUSDT', exchangeInfo);
    expect(precision).toBe(0.1);
  });

  it('getQuantityPrecision', () => {
    let precision = getQuantityPrecision('BTCUSDT', exchangeInfo);
    expect(precision).toBe(3);
  });
});
