import { CandleChartInterval } from 'binance-api-node';
import dayjs from 'dayjs';
import { binanceClient } from '../../init';
import {
  getCandleSourceType,
  loadCandlesFromAPI,
  loadCandlesFromCSV,
  loadCandlesMultiTimeFramesFromAPI,
  loadCandlesMultiTimeFramesFromCSV,
} from '../loadCandleData';

describe('Candle Data', () => {
  let defaultCandleProps: CandleData = {
    symbol: 'BTCUSDT',
    interval: CandleChartInterval.ONE_HOUR,
    close: 10,
    high: 20,
    low: 30,
    open: 40,
    volume: 50,
    closeTime: new Date(),
    openTime: new Date(),
  };
  let symbol = 'BTCUSDT';
  let timeFrame = CandleChartInterval.ONE_HOUR;
  let startDate = '2022-01-01 00:00:00';
  let endDate = '2022-03-01 00:00:00';

  it('getCandleSourceType', () => {
    let length = 5;
    let candles: CandleData[] = new Array(length).fill(defaultCandleProps);
    expect(getCandleSourceType(candles, 'close')).toStrictEqual(
      new Array(length).fill(defaultCandleProps.close)
    );
    expect(getCandleSourceType(candles, 'high')).toStrictEqual(
      new Array(length).fill(defaultCandleProps.high)
    );
    expect(getCandleSourceType(candles, 'low')).toStrictEqual(
      new Array(length).fill(defaultCandleProps.low)
    );
    expect(getCandleSourceType(candles, 'open')).toStrictEqual(
      new Array(length).fill(defaultCandleProps.open)
    );
    expect(getCandleSourceType(candles, 'volume')).toStrictEqual(
      new Array(length).fill(defaultCandleProps.volume)
    );
    expect(getCandleSourceType(candles, 'hl2')).toStrictEqual(
      new Array(length).fill(
        (defaultCandleProps.high + defaultCandleProps.low) / 2
      )
    );
    expect(getCandleSourceType(candles, 'hlc3')).toStrictEqual(
      new Array(length).fill(
        (defaultCandleProps.high +
          defaultCandleProps.low +
          defaultCandleProps.close) /
          3
      )
    );
    expect(getCandleSourceType(candles, 'hlcc4')).toStrictEqual(
      new Array(length).fill(
        (defaultCandleProps.high +
          defaultCandleProps.low +
          2 * defaultCandleProps.close) /
          4
      )
    );
    expect(getCandleSourceType(candles, null)).toStrictEqual(
      new Array(length).fill(defaultCandleProps.close)
    );
  });

  it('loadCandlesFromAPI', async () => {
    let candles: CandleData[] = await loadCandlesFromAPI(
      symbol,
      timeFrame,
      binanceClient
    );
    expect(candles).toBeDefined();
    expect(candles.length).toBeGreaterThan(0);
    expect(candles[0].symbol).toBe(symbol);
  });

  it('loadCandlesFromCSV', async () => {
    let candles: CandleData[] = await loadCandlesFromCSV(
      symbol,
      timeFrame,
      startDate,
      endDate
    );
    expect(candles).toBeDefined();
    expect(candles.length).toBeGreaterThan(0);
    expect(candles[0].symbol).toBe(symbol);
    expect(dayjs(candles[0].openTime).isBetween(startDate, endDate)).toBe(true);
    expect(
      dayjs(candles[candles.length - 1].closeTime).isBetween(startDate, endDate)
    ).toBe(true);
  });

  it('loadCandlesMultiTimeFramesFromAPI', async () => {
    let timeFrames = [
      CandleChartInterval.ONE_HOUR,
      CandleChartInterval.ONE_DAY,
    ];
    let data: CandlesDataMultiTimeFrames =
      await loadCandlesMultiTimeFramesFromAPI(
        symbol,
        timeFrames,
        binanceClient
      );

    timeFrames.forEach((timeFrame) => {
      expect(data[timeFrame]).toBeDefined();
      expect(data[timeFrame].length).toBeGreaterThan(0);
      expect(data[timeFrame][0].symbol).toBe(symbol);
    });
  });

  it('loadCandlesMultiTimeFramesFromCSV', async () => {
    let timeFrames = [
      CandleChartInterval.ONE_HOUR,
      CandleChartInterval.FIFTEEN_MINUTES,
    ];
    let data: CandlesDataMultiTimeFrames =
      await loadCandlesMultiTimeFramesFromCSV(
        symbol,
        timeFrames,
        new Date(startDate),
        new Date(endDate)
      );

    timeFrames.forEach((timeFrame) => {
      expect(data[timeFrame]).toBeDefined();
      expect(data[timeFrame].length).toBeGreaterThan(0);
      expect(data[timeFrame][0].symbol).toBe(symbol);
      expect(data[timeFrame][0].symbol).toBe(symbol);
      expect(
        dayjs(data[timeFrame][0].openTime).isBetween(startDate, endDate)
      ).toBe(true);
      expect(
        dayjs(data[timeFrame].slice(-1)[0].closeTime).isBetween(
          startDate,
          endDate
        )
      ).toBe(true);
    });
  });
});
