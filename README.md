# Binance trading bot

## Setup Environment

### Development

Set your api keys to the environment variables for testnet in `.env`. Check https://testnet.binancefuture.com/en/futures/BTCUSDT and https://testnet.binance.vision/ to get your keys. Then run the commands:

```
npm run build:dev
npm run dev
```

### Production

Get your api keys from your Binance account and set them to the environment variables `BINANCE_PUBLIC_KEY` and `BINANCE_PRIVATE_KEY` in the file `.env`. Then, run the commands:

```
npm run build:prod
npm run prod
```

## Create your strategy

You can create your own strategy for your bot. At first, you must decide if the bot will trade in spot or futures mode by changing `BINANCE_MODE`constant in the fil `src/index/ts`. Next, look up the existing configs to make your own. Don't forget to backtest if before running it in production !

## Backtesting

You can backtest your own strategy by running the backtest mode. To do that, you need to:

1. Download the data for your currencies at https://www.cryptodatadownload.com/data/binance/ and move the files to the folder `data`. Run the command `npm run data` to generate your historical data on multiple time frames (1m, 5m, 15m, 30m, 1h, 2h, 4h, 6h, 12h, 1d) that you want.
2. When the data are ready, choose your trading configuration in `src/configs` and import it to the backtest constructor initializer in `src/index.tx`. You can set your test period, the initial capital, and choose your strategy name at the same time. Then, run the command `npm run test` to start the backtest.
3. When the backtest ends, it generates a log file in the folder `logs` and an html report in `reports`. You can consulting these to evaluate the performance and profitability of your strategy.

## Documentation

- https://github.com/binance/binance-spot-api-docs/blob/master/rest-api.md
- https://github.com/Ashlar/binance-api-node/blob/master/README.md
- https://binance-docs.github.io/apidocs/spot/en/
- https://binance-docs.github.io/apidocs/futures/en/
