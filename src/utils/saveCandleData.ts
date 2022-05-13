import path from 'path';
import fs from 'fs';
import dayjs from 'dayjs';
import { CandleChartInterval } from 'binance-api-node';
import { timeFrameToMinutes } from './timeFrame';
import { binanceClient } from '../init';

const maxLoadedCandleData = 500; // The maximum number of candles that can be fetch from the api
const maxRequestPerMinutes = 2400;

const dataDirectory = path.resolve(process.cwd(), 'data');

function getLastCandleDate(csvFile: string) {
  if (!fs.existsSync(csvFile)) {
    // Oldest date from the binance futures candlestick data
    return dayjs('2020-01-01 00:00:00', 'YYYY-MM-DD HH:mm:ss').valueOf();
  }

  let data = fs.readFileSync(csvFile);
  let content = data.toString().split('\n');

  if (content.length > 1) {
    let lastCandle = content[1];
    let lastDate = lastCandle.split(',')[1];
    return dayjs(lastDate, 'YYYY-MM-DD HH:mm:ss').valueOf();
  } else {
    // Oldest date from the binance futures candlestick data
    return dayjs('2020-01-01 00:00:00', 'YYYY-MM-DD HH:mm:ss').valueOf();
  }
}

/**
 * Append data at the beginning of the csv file
 * @param newData
 * @param csvFile
 */
function appendToCsvFile(newData: string, csvFile: string) {
  if (fs.existsSync(csvFile)) {
    let oldData = fs.readFileSync(csvFile); // read existing contents into data
    if (oldData.length === 0) {
      fs.writeFileSync(csvFile, newData);
    } else {
      const headers = [
        'symbol',
        'openTime',
        'closeTime',
        'open',
        'high',
        'low',
        'close',
        'volume',
      ];
      let fullData =
        headers.join(',') +
        '\n' +
        newData +
        oldData.toString().split('\n').slice(1).join('\n');
      fs.writeFileSync(csvFile, fullData);
    }
  } else {
    fs.writeFileSync(csvFile, newData);
  }
}

/**
 * Fetch the candle data from api and store then into csv file
 * @param symbol
 * @param timeFrame
 */
export async function saveCandleDataFromAPI(
  symbol: string,
  timeFrame: CandleChartInterval
) {
  if (!fs.existsSync(dataDirectory)) {
    fs.mkdirSync(dataDirectory);
  }

  if (!fs.existsSync(path.join(dataDirectory, symbol))) {
    fs.mkdirSync(path.join(dataDirectory, symbol));
  }

  const dataFile = path.join(dataDirectory, symbol, `_${timeFrame}.csv`);

  // ---------------------------------------------------------------------------

  const lastDate = getLastCandleDate(dataFile);
  const today = Date.now();

  // We consider that the data are up to date, no need to fetch the api
  if (lastDate > dayjs(today).subtract(1, 'day').valueOf()) {
    return;
  }

  const loadCandlesPromises: Promise<CandleData[]>[] = [];
  const delay = 60000 / maxRequestPerMinutes; // delay between requests to api

  let tempTimeStamp = lastDate;
  let timeStamps: number[] = [];

  // Calculate the first timestamp of each fragment of X candles to load
  while (tempTimeStamp < dayjs(today).subtract(1, 'day').valueOf()) {
    timeStamps.push(tempTimeStamp);
    tempTimeStamp +=
      maxLoadedCandleData * timeFrameToMinutes(timeFrame) * 60000;
  }

  // Create the promises to load the fragments of data
  for (let i = 0; i < timeStamps.length; i++) {
    loadCandlesPromises.push(
      new Promise((resolve, reject) => {
        setTimeout(async () => {
          let candles = await binanceClient.futuresCandles({
            symbol,
            interval: timeFrame,
            startTime: timeStamps[i],
            endTime: i + 1 < timeStamps.length ? timeStamps[i + 1] : today,
          });

          let data: CandleData[] = candles
            .map((c) => ({
              symbol,
              openTime: dayjs(c.openTime).toDate(),
              closeTime: dayjs(c.closeTime).toDate(),
              interval: timeFrame,
              open: Number(c.open),
              high: Number(c.high),
              low: Number(c.low),
              close: Number(c.close),
              volume: Number(c.volume),
            }))
            .reverse();

          if (candles) resolve(data);
          else reject();
        }, i * delay);
      })
    );
  }

  // Add the candles data to the csv
  await Promise.all(loadCandlesPromises).then((dataFragment) => {
    dataFragment.forEach((fragment) => {
      let dataString = fragment
        .map(
          ({ symbol, openTime, closeTime, open, high, low, close, volume }) =>
            [
              symbol,
              dayjs(openTime).format('YYYY-MM-DD HH:mm:ss'),
              dayjs(closeTime).format('YYYY-MM-DD HH:mm:ss'),
              open,
              high,
              low,
              close,
              volume,
            ].join(',')
        )
        .join('\n');

      appendToCsvFile(dataString + '\n', dataFile);
    });
  });
}
