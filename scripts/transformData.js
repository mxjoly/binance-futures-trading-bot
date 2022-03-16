const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');

const dataDirectory = path.resolve(process.cwd(), 'data');

function transformData(symbol, interval, from, to) {
  const fileToTransform = path.resolve(
    dataDirectory,
    symbol.toUpperCase(),
    `_${interval}.csv`
  );

  if (fs.existsSync(fileToTransform)) {
    const candles = [];

    fs.createReadStream(fileToTransform)
      .pipe(csv({ separator: ',' }))
      .on('data', (data) => {
        if (
          new Date(data.openTime).getTime() >= new Date(from).getTime() &&
          new Date(data.closeTime).getTime() <= new Date(to).getTime()
        ) {
          candles.push({
            openTime: new Date(data.openTime).getTime(),
            closeTime: new Date(data.closeTime).getTime(),
            open: Number(data.open),
            high: Number(data.high),
            low: Number(data.low),
            close: Number(data.close),
            volume: Number(data.volume),
          });
        }
      })
      .on('end', () => {
        const outputFile = path.resolve(
          dataDirectory,
          symbol.toUpperCase(),
          `_${interval}.js`
        );

        const content = `var data = [
          ${candles
            .map(
              (c) =>
                `{ ot: ${c.openTime}, ct: ${c.closeTime}, o: ${c.open}, h: ${c.high}, l:${c.low}, c:${c.close}, v:${c.volume} }`
            )
            .join(',')
            .toString()}
        ]`;

        fs.writeFileSync(outputFile, content, 'utf8');
      });
  } else {
    console.error(`The file doesn't not exists`);
  }
}

transformData('BTCUSDT', '5m', '2020-01-01', '2022-03-01');
