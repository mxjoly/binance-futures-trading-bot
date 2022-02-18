# Binance trading bot

## Setup Environment

Get your api keys from your Binance account and set them to the environment variables `BINANCE_PUBLIC_KEY` and `BINANCE_PRIVATE_KEY` in the file `.env` (duplicate and rename the file `.env.example`)

## Backtest

To backtest your strategy, download the historical data of your asset on https://www.cryptodatadownload.com/data/binance/ and move the file to the folder `data`. Run the command `npm run data` to generate your historical data on multiple time frames (1m, 5m, 15m, 30m, 1h, 2h, 4h, 6h, 12h, 1d).

## Documentation

- https://github.com/binance/binance-spot-api-docs/blob/master/rest-api.md
- https://github.com/Ashlar/binance-api-node/blob/master/README.md
- https://binance-docs.github.io/apidocs/spot/en/
- https://binance-docs.github.io/apidocs/futures/en/
