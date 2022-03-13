import fs from 'fs';
import path from 'path';
import csv from 'csv-parser';
import dayjs from 'dayjs';
import { Binance, CandleChartInterval } from 'binance-api-node';
import { BINANCE_MODE } from '../init';

/**
 * Load the candle data on a symbol, on a specific time frames, and on a date range
 * @param symbol The symbol to load the candles
 * @param interval The time frame to load
 * @param startDate
 * @param endDate
 */
export function loadCandlesFromCSV(
  symbol: string,
  interval: CandleChartInterval,
  startDate: string | number | Date,
  endDate: string | number | Date,
  onlyFinalCandle = false
) {
  return new Promise<CandleData[]>((resolve, reject) => {
    let file = path.join(process.cwd(), 'data', symbol, `_${interval}.csv`);
    let candleData: CandleData[] = [];
    let results: CandleData[] = [];

    fs.createReadStream(file)
      .pipe(csv({ separator: ',' }))
      .on('data', (data: CandleData) => {
        candleData.push({
          openTime: new Date(data.openTime),
          closeTime: new Date(data.closeTime),
          open: Number(data.open),
          close: Number(data.close),
          high: Number(data.high),
          low: Number(data.low),
          volume: Number(data.volume),
        });
      })
      .on('end', () => {
        candleData = candleData.reverse();
        candleData = candleData.slice(
          0,
          onlyFinalCandle ? -1 : candleData.length
        );

        for (let i = 0; i < candleData.length; i++) {
          if (
            dayjs(candleData[i].openTime).isBetween(
              dayjs(startDate),
              dayjs(endDate),
              'second',
              '[]'
            ) &&
            dayjs(candleData[i].closeTime).isBetween(
              dayjs(startDate),
              dayjs(endDate),
              'second',
              '[]'
            )
          ) {
            results.push({
              open: candleData[i].open,
              close: candleData[i].close,
              high: candleData[i].high,
              low: candleData[i].low,
              volume: candleData[i].volume,
              openTime: candleData[i].openTime,
              closeTime: candleData[i].closeTime,
            });
          }
        }
        resolve(results);
      });
  });
}

/**
 * Load the candle data for a specific time frame (or interval) from the binance api
 * @param symbol
 * @param interval
 * @param onlyFinalCandle
 */
export function loadCandlesFromAPI(
  symbol: string,
  interval: CandleChartInterval,
  binanceClient: Binance,
  onlyFinalCandle = true
) {
  return new Promise<CandleData[]>((resolve, reject) => {
    const getCandles =
      BINANCE_MODE === 'spot'
        ? binanceClient.candles
        : binanceClient.futuresCandles;

    getCandles({ symbol, interval })
      .then((candles) => {
        resolve(
          candles
            .slice(0, onlyFinalCandle ? -1 : candles.length)
            .map((candle) => ({
              open: Number(candle.open),
              high: Number(candle.high),
              low: Number(candle.low),
              close: Number(candle.close),
              volume: Number(candle.volume),
              openTime: new Date(candle.openTime),
              closeTime: new Date(candle.closeTime),
            }))
        );
      })
      .catch(reject);
  });
}

/**
 * Load the candle data from the downloaded data on multi time frames
 * @param strategyConfigs
 */
export async function loadCandlesMultiTimeFramesFromCSV(
  strategyConfigs: StrategyConfig[],
  startDate: Date,
  endDate: Date
) {
  let candlesMtf: {
    [symbol: string]: CandlesDataMultiTimeFrames;
  } = {};

  // Initialization of the arrays
  strategyConfigs.forEach(
    ({ asset, base, loopInterval, indicatorIntervals }) => {
      candlesMtf[asset + base] = {};
      new Set([loopInterval, ...indicatorIntervals]).forEach((interval) => {
        candlesMtf[asset + base][interval] = [];
      });
    }
  );

  // Load the candle data according to the time frame of the trading configuration
  let loadPairTimeFrame = [];

  strategyConfigs.forEach(
    ({ asset, base, loopInterval, indicatorIntervals }) => {
      new Set([loopInterval, ...indicatorIntervals]).forEach((interval) => {
        loadPairTimeFrame.push(
          new Promise<void>((resolve, reject) => {
            loadCandlesFromCSV(asset + base, interval, startDate, endDate)
              .then((candles) => {
                candlesMtf[asset + base][interval] = candles;
                resolve();
              })
              .catch(reject);
          })
        );
      });
    }
  );

  await Promise.all(loadPairTimeFrame);
  return candlesMtf;
}

/**
 * Load the candle data from binance api for all the time frames needed for the strategy
 * @param strategyConfig
 */
export async function loadCandlesMultiTimeFramesFromAPI(
  strategyConfig: StrategyConfig,
  binanceClient: Binance
) {
  let loadTimeFrames: Promise<CandlesDataMultiTimeFrames>[] = [];

  strategyConfig.indicatorIntervals.forEach((interval: CandleChartInterval) => {
    loadTimeFrames.push(
      new Promise<CandlesDataMultiTimeFrames>((resolve, reject) => {
        loadCandlesFromAPI(
          strategyConfig.asset + strategyConfig.base,
          interval,
          binanceClient,
          true
        )
          .then((candles) => {
            resolve({
              interval,
              candles: candles.map((candle) => ({
                open: Number(candle.open),
                high: Number(candle.high),
                low: Number(candle.low),
                close: Number(candle.close),
                volume: Number(candle.volume),
                openTime: new Date(candle.openTime),
                closeTime: new Date(candle.closeTime),
              })),
            });
          })
          .catch(reject);
      })
    );
  });

  return Promise.all(loadTimeFrames);
}
