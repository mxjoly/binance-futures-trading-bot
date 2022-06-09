![GitHub package.json version](https://img.shields.io/github/package-json/v/mxjoly/binance-trading-bot)
![styled with prettier](https://img.shields.io/badge/styled_with-prettier-ff69b4.svg)
![GitHub](https://img.shields.io/github/license/mxjoly/binance-trading-bot)

# 🤖 Binance trading bot

## Features

- 🔨 Build your own strategy
- ✅ Can use multiple strategies at same time with different coins
- ⚙️ Configure the conditions to open / close a position
- 🎛 Multiple indicators to use for your strategies (moving averages, bollinger bands, rsi, macd, adx, ...)
- 🕰 Trading sessions
- ⏱ Limit the duration of the trades
- ✅ Multiple time frames can be used in a single strategy
- ✅ Money management
- 🩺 Backtesting with complete report (html file)
- 💊 Hyper parameters optimization
- ✅ Telegram channel notifications

## Setup the environment

### Development

Set your api keys to the environment variables for testnet in `.env` with `BINANCE_FUTURES_TESTNET_PUBLIC_KEY` and `BINANCE_FUTURES_TESTNET_PRIVATE_KEY`. Go to https://testnet.binancefuture.com/en/futures/BTCUSDT and https://testnet.binance.vision/ to get your keys. Then run the commands:

```bash
npm run build:dev
npm run dev
```

### Production

Get your api keys from your Binance account and set them to the environment variables `BINANCE_PUBLIC_KEY` and `BINANCE_PRIVATE_KEY` in the file `.env`. Then, run the commands:

```bash
npm run build:prod
npm run prod
```

## Create your strategy

You can create your own strategy for your bot. The file must be placed in `src/configs`. There are some examples to help you to create the best strategy. Check the declaration file `global.d.ts` to have an overview of the possibilities you can add to your strategy. And don't forget to backtest your strategy before running it in production !

## Backtest your strategy

You can backtest your strategy by running the backtest mode. To do that, you need to:

1. Configure the properties for your backtest in `config.json`.
2. Tap the commands `npm build:test` and `npm run test` to run the backtest.
3. When the backtest ends, it generates a log file in the folder `logs` and an html report in `reports`. You can consulting these to evaluate the performance and profitability of your strategy (note that the results in real will be a little different cause of the funding rates).

## Configure the Telegram Channel

See https://core.telegram.org/bots to configure the channel. Then, set up your bot api key to the environment variable `TELEGRAM_TOKEN` and the id of the chat with `TELEGRAM_CHAT_ID`.

## Machine Learning

In progress...

## Todo

- [x] Add custom Telegram channel with the notifications of the robot when an action is executed
- [ ] Trade managements

## Documentation

- https://github.com/binance/binance-spot-api-docs/blob/master/rest-api.md
- https://github.com/Ashlar/binance-api-node/blob/master/README.md
- https://binance-docs.github.io/apidocs/spot/en/
- https://binance-docs.github.io/apidocs/futures/en/

## License

[MIT.](./LICENSE)
