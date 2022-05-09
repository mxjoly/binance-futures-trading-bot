import { CandleChartInterval } from 'binance-api-node';
import { Cache } from '../cache';
import objectHash from 'object-hash';

const consoleError = console.error;

describe('Cache', () => {
  let cache: Cache;
  let optionHash: string;
  let symbol: string;
  let timeFrame: CandleChartInterval;
  let now: number;

  beforeEach(() => {
    cache = new Cache();
    optionHash = objectHash({ period: 14 });
    symbol = 'BTCUSDT';
    timeFrame = CandleChartInterval.ONE_HOUR;
    now = Date.now();
  });

  beforeEach(() => {
    console.error = jest.fn();
  });

  afterEach(() => {
    console.error = consoleError;
  });

  it('create allocation on memory', () => {
    cache.createKey(symbol, timeFrame, optionHash);
    expect(cache.exist(symbol, timeFrame, optionHash)).toBe(true);
  });

  it('save value to existing key', () => {
    cache.createKey(symbol, timeFrame, optionHash);
    cache.saveValue(symbol, timeFrame, optionHash, now, 50);
    expect(cache.get(symbol, timeFrame, optionHash, now)).toBe(50);
  });

  it('check if a key exists', () => {
    cache.createKey(symbol, timeFrame, optionHash);
    expect(cache.exist(symbol, timeFrame, optionHash)).toBe(true);
  });

  it("check a key that does'nt exist", () => {
    expect(cache.exist(symbol, timeFrame, optionHash)).toBe(false);
  });

  it('save value to non-existent key', () => {
    cache.saveValue('ETHUSDT', timeFrame, optionHash, now, 50);
    expect(cache.get('ETHUSDT', timeFrame, optionHash, now)).toBe(50);
  });

  it('save values to existing key', () => {
    let dates = [0, 1, 2, 3, 4];
    let values = [123, 456, 789, 234, 567];
    cache.createKey(symbol, timeFrame, optionHash);
    cache.saveValues(symbol, timeFrame, values, dates, optionHash);
    dates.forEach((date, i) => {
      expect(cache.get(symbol, timeFrame, optionHash, date)).toBe(values[i]);
    });
  });

  it('save values to non-existing key', () => {
    let dates = [0, 1, 2, 3, 4]; // timestamps
    let values = [123, 456, 789, 234, 567];
    cache.saveValues(symbol, timeFrame, values, dates, optionHash);
    dates.forEach((date, i) => {
      expect(cache.get(symbol, timeFrame, optionHash, date)).toBe(values[i]);
    });
  });

  it('save values with dates and values arguments with different array size', () => {
    let dates = [0, 1, 2, 3, 4]; // timestamps
    let values = [123, 456, 789, 234];
    cache.saveValues(symbol, timeFrame, values, dates, optionHash);
    expect(cache.exist(symbol, timeFrame, optionHash)).toBe(false);
  });

  it('get values of unknown key returns null', () => {
    expect(cache.get(symbol, timeFrame, optionHash, now)).toBe(null);
  });

  it('get values of unknown date returns null', () => {
    cache.saveValue(symbol, timeFrame, optionHash, now, 50);
    expect(cache.get(symbol, timeFrame, optionHash, now + 1)).toBe(null);
  });
});
