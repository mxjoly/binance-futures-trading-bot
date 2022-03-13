# Binance trading bot

## Setup Environment

### Development

Set your api keys to the environment variables for testnet in `.env`. Go to https://testnet.binancefuture.com/en/futures/BTCUSDT and https://testnet.binance.vision/ to get your keys. Then run the commands:

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

You can create your own strategy for your bot. The file must be placed in `src/configs`. There are some examples to help you to create the best strategy. Check the declaration file `global.d.ts` to have an overview of the possibilities you can add to your strategy. And don't forget to backtest your strategy before running it in production !

## Backtesting your strategy

You can backtest your own strategy by running the backtest mode. To do that, you need to:

1. Download the data for your currencies at https://www.cryptodatadownload.com/data/binance/ and move the files to the folder `data`. Delete the first line of the file content and run the command `npm run data` to generate your historical data on multiple time frames (1m, 5m, 15m, 30m, 1h, 2h, 4h, 6h, 12h, 1d) that you want.
2. When the data are ready, update the json file `config.json` as you want to prepare the backtest.
3. Tap the commands `npm build:test` and `npm run test` to run the backtest.
4. When the backtest ends, it generates a log file in the folder `logs` and an html report in `reports`. You can consulting these to evaluate the performance and profitability of your strategy.

![demo](./demo/report-preview.png)

## Machine Learning

### Classification with K-nearest neighbors (KNN)

With the KNN algorithm, the bot will try to predict the price movement that will happen N bars later.

#### Quick Start

```
npm run build:test
npm run ai:knn:test
```

#### Configuration

To configure the KNN classifier, go to the namespace `knn` in the file `config.json`.

| Key                    | Type / Format              | Description                                                 |
| ---------------------- | -------------------------- | ----------------------------------------------------------- |
| `start_date_training`  | `YYYY-MM-DD HH:mm:ss`      | The start date of the training period                       |
| `end_date_training`    | `YYYY-MM-DD HH:mm:ss`      | The end date of the training period                         |
| `start_date_test`      | `YYYY-MM-DD HH:mm:ss`      | The start date of the test period                           |
| `end_date_test`        | `YYYY-MM-DD HH:mm:ss`      | The end date of the test period                             |
| `prediction_period`    | `number`                   | The prediction is made for N bars later                     |
| `prediction_threshold` | `number` (between 0 and 1) | The bot make a prediction only when the probability is high |
| `price_change`         | `number` (percentage)      | The price change to predict                                 |
| `features/*`           | `boolean`                  | The indicators to use in the dataset                        |

### Neuro Evolution of Augmented Topologies (NEAT)

I implemented the NEAT algorithm using the template of Code-Bullet [here](https://github.com/Code-Bullet/NEAT-Template-JavaScript).

#### Quick Start

```js
npm run build:test
npm run ai:neat:train
npm run test:neat
```

#### Configuration

To configure the parameters of the algorithm, go to the namespace `neat` in the file `config.json`.

| Key                                   | Type / Format                         | Description                                                                                                                                    |
| ------------------------------------- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `start_date_training`                 | `YYYY-MM-DD HH:mm:ss`                 | The start date of the training period                                                                                                          |
| `end_date_training`                   | `YYYY-MM-DD HH:mm:ss`                 | The end date of the training period                                                                                                            |
| `start_date_test`                     | `YYYY-MM-DD HH:mm:ss`                 | The start date of the test period                                                                                                              |
| `end_date_test`                       | `YYYY-MM-DD HH:mm:ss`                 | The end date of the test period                                                                                                                |
| `initial_capital`                     | `number`                              | The initial capital for the players                                                                                                            |
| `population`                          | `number`                              | The number of genomes for each generation                                                                                                      |
| `generations`                         | `number`                              | The total number of generations                                                                                                                |
| `goals/win_rate`                      | `number` (between 0 and 1) or `null`  | The win rate to reach by the players to keep them alive                                                                                        |
| `goals/profit_ratio`                  | `number` (> 1) or `null`              | The profit ratio to reach by the players to keep them alive (Same as Risk Reward). It's the result of `total_profit - total_loss + total_fees` |
| `goals/max_relative_drawdown`         | `number` (between -1 and 0) or `null` | The maximum relative drawdown authorized                                                                                                       |
| `neural_network/inputs_mode`          | `candles` or `indicators`             | Use candles data or indicator values for the inputs of network                                                                                 |
| `neural_network/candle_inputs/length` | `number`                              | The number of candles to use for the inputs                                                                                                    |
| `neural_network/candle_inputs/close`  | `open`, `high`, `low`, `close`, `hl2` | The type of data used in the candles                                                                                                           |
| `neural_network/indicator_inputs/*`   | `boolean`                             | Use or not the indicator values                                                                                                                |

## Todo

- [ ] Calculation of the average buying price of an asset in spot
- [x] Implement genetic algorithm (NEAT)
- [ ] Add custom Telegram channel with the notifications of the robot when an action is executed
- [ ] Trade managements
- [x] Add a trade configuration property to limited the holding duration of a trade or position
- [ ] Spot portfolio arbitrage in spot

## Documentation

- https://github.com/binance/binance-spot-api-docs/blob/master/rest-api.md
- https://github.com/Ashlar/binance-api-node/blob/master/README.md
- https://binance-docs.github.io/apidocs/spot/en/
- https://binance-docs.github.io/apidocs/futures/en/

## License

[MIT.](./LICENSE)
