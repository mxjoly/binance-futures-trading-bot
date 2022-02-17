const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const dateTime = require('date-and-time');

const dataDirectory = path.resolve(process.cwd(), 'data');

// ================================================================================= //

function TimeFrameToMinutes(timeFrame) {
  switch (timeFrame) {
    case '1m':
      return 1;
    case '5m':
      return 5;
    case '15m':
      return 15;
    case '30m':
      return 30;
    case '1h':
      return 60;
    case '2h':
      return 120;
    case '4h':
      return 240;
    case '6h':
      return 360;
    case '12h':
      return 720;
    case '1d':
      return 1440;
    default:
      return 1;
  }
}

/**
 * Test if a date string match a time frame
 * @param {string} date
 * @param {string} timeFrame
 */
function dateMatchTimeFrame(date, timeFrame) {
  let dateFormat = dateTime.format(new Date(date), 'HH:mm');
  switch (timeFrame) {
    case '1m':
      return /^(0[0-9]|1[0-9]|2[0-3]):[0-5][0-9]$/.test(dateFormat);
    case '5m':
      return /^(0[0-9]|1[0-9]|2[0-3]):[0-5][05]$/.test(dateFormat);
    case '15m':
      return /^(0[0-9]|1[0-9]|2[0-3]):(00|15|30|45)$/.test(dateFormat);
    case '30m':
      return /^(0[0-9]|1[0-9]|2[0-3]):(00|30)$/.test(dateFormat);
    case '1h':
      return /^(0[0-9]|1[0-9]|2[0-3]):(00)$/.test(dateFormat);
    case '2h':
      return /^(0[02468]|1[02468]|2[02]):(00)$/.test(dateFormat);
    case '4h':
      return /^(0[048]|1[26]|2[0]):(00)$/.test(dateFormat);
    case '6h':
      return /^(0[06]|1[28]):(00)$/.test(dateFormat);
    case '12h':
      return /^(00|12):(00)$/.test(dateFormat);
    case '1d':
      return /^(00):(00)$/.test(dateFormat);
    default:
      return false;
  }
}

/**
 * Convert the candlestick data to a higher time frame
 * @param {string} filePath file to transform
 * @param {string} symbol
 * @param {string} newTimeFrame
 */
function transformDataToNewTimeFrame(filePath, symbol, newTimeFrame) {
  const loadedData = [];

  const newFile = path.join(dataDirectory, symbol, `_${newTimeFrame}.csv`);

  if (fs.existsSync(newFile)) {
    reject(`${filePath} has been already transformed in ${newTimeFrame}`);
  }

  fs.createReadStream(filePath)
    .pipe(csv({ separator: ',' }))
    .on('data', (data) => {
      loadedData.push(data);
    })
    .on('end', () => {
      // The new candle data in the higher time frame
      let newCandles = [];
      // Index to start to construct the candlestick data in the new time frame
      let startIndex = loadedData.length - 1;

      const highest = (startIndex, endIndex) => {
        let highest = loadedData[startIndex].high;
        for (let i = startIndex; i >= endIndex; i--) {
          if (loadedData[i].high > highest) highest = loadedData[i].high;
        }
        return highest;
      };

      const lowest = (startIndex, endIndex) => {
        let lowest = loadedData[startIndex].low;
        for (let i = startIndex - 1; i >= endIndex; i--) {
          if (loadedData[i].low < lowest) lowest = loadedData[i].low;
        }
        return lowest;
      };

      const volume = (startIndex, endIndex) => {
        let volume = 0;
        let base = loadedData[0].symbol.split('/')[0];
        for (let i = startIndex - 1; i >= endIndex; i--) {
          volume += Number(loadedData[i][`Volume ${base}`]);
        }
        return volume.toFixed(3);
      };

      // Start to use candle at 00:00
      while (
        dateTime.format(new Date(loadedData[startIndex].date), 'HH:mm') !==
        '00:00'
      ) {
        loadedData.pop();
        startIndex--;
      }

      for (let i = startIndex; i >= 0; i--) {
        // The new high candle will be construct between these index
        let startCandleIndex = i;
        let endCandleIndex = i;

        if (!dateMatchTimeFrame(loadedData[i].date, newTimeFrame)) continue;

        // Find the next candles that match the time frame
        for (let j = i - 1; j >= 0; j--) {
          if (dateMatchTimeFrame(loadedData[j].date, newTimeFrame)) {
            endCandleIndex = j + 1;
            break;
          }
        }

        // To get only final candles
        if (
          loadedData.length - (loadedData.length - startCandleIndex) <
          TimeFrameToMinutes(newTimeFrame)
        )
          break;

        if (endCandleIndex >= 0) {
          newCandles.push({
            date: loadedData[startCandleIndex].date,
            symbol: loadedData[startCandleIndex].symbol,
            open: loadedData[startCandleIndex].open,
            high: highest(startCandleIndex, endCandleIndex),
            low: lowest(startCandleIndex, endCandleIndex),
            close: loadedData[endCandleIndex].close,
            volume: volume(startCandleIndex, endCandleIndex),
          });
        }
      }

      const headers = [
        'date',
        'symbol',
        'open',
        'high',
        'low',
        'close',
        'volume',
      ];
      const content =
        headers.join(',') +
        '\n' +
        newCandles
          .map((candle) => Object.values(candle).join(','))
          .reverse()
          .join('\n');

      fs.writeFile(newFile, content, (err) => {
        if (err) throw err;
        console.log(`${newFile} generated`);
      });
    });
}

function run() {
  const pathToProcess = dataDirectory;
  const timeFrames = process.argv[2].split(','); // Get the time frames from command line

  fs.readdir(pathToProcess, (err, files) => {
    if (err) {
      return console.error('Unable to scan directory: ' + err);
    }

    timeFrames.forEach((timeFrame) => {
      files.forEach((file) => {
        const filePath = path.join(pathToProcess, file);

        if (!fs.lstatSync(filePath).isDirectory()) {
          const symbol = file.split('_')[0];

          // Create folder data/SYMBOL
          if (!fs.existsSync(path.join(dataDirectory, symbol)))
            fs.mkdirSync(path.join(dataDirectory, symbol));

          if (
            !fs.existsSync(
              path.join(dataDirectory, symbol, `_${timeFrame}.csv`)
            )
          ) {
            transformDataToNewTimeFrame(filePath, symbol, timeFrame);
          } else {
            console.log(
              `${file} has been already processed for the time frame ${timeFrame}`
            );
          }
        }
      });
    });
  });
}

run();
