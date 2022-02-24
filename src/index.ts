import fs from 'fs';
import Binance, { CandleChartInterval } from 'binance-api-node';
import { createLogger, transports, format } from 'winston';
import { Bot } from './bot';
import { BackTestBot } from './backtest/bot';
import Config from './configs/stochasticRsi';
import { initializePlugins } from './utils/plugins';

// Initialize environment variables
require('dotenv').config();

// Initialize the plugins of dayjs
initializePlugins();

const loggerFilePath = {
  production: 'logs/bot-prod.log',
  development: 'logs/bot-dev.log',
  test: 'logs/bot-test.log',
};

if (fs.existsSync(loggerFilePath[process.env.NODE_ENV])) {
  fs.unlinkSync(loggerFilePath[process.env.NODE_ENV]);
}

export const logger = createLogger({
  level: 'info',
  format: format.simple(),
  transports: [
    new transports.File({
      filename: loggerFilePath[process.env.NODE_ENV],
    }),
  ],
});

export const binanceClient = Binance(
  process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'test'
    ? {
        apiKey: process.env.BINANCE_PUBLIC_KEY,
        apiSecret: process.env.BINANCE_PRIVATE_KEY,
      }
    : {
        apiKey:
          // @ts-ignore
          BINANCE_MODE === 'spot'
            ? process.env.BINANCE_SPOT_TESTNET_PUBLIC_KEY
            : process.env.BINANCE_FUTURES_TESTNET_PUBLIC_KEY,
        apiSecret:
          // @ts-ignore
          BINANCE_MODE === 'spot'
            ? process.env.BINANCE_SPOT_TESTNET_PRIVATE_KEY
            : process.env.BINANCE_FUTURES_TESTNET_PRIVATE_KEY,
        httpBase: 'https://testnet.binance.vision',
        wsBase: 'wss://testnet.binance.vision/ws',
        httpFutures: 'https://testnet.binancefuture.com',
        wsFutures: 'wss://fstream.binance.com/ws',
      }
);

// The bot will trade with the binance :
export const BINANCE_MODE: BinanceMode = 'futures';

// Supported time frame by the robot
export const supportedTimeFrames = [
  CandleChartInterval.ONE_MINUTE,
  CandleChartInterval.FIVE_MINUTES,
  CandleChartInterval.FIFTEEN_MINUTES,
  CandleChartInterval.THIRTY_MINUTES,
  CandleChartInterval.ONE_HOUR,
  CandleChartInterval.TWO_HOURS,
  CandleChartInterval.FOUR_HOURS,
  CandleChartInterval.SIX_HOURS,
  CandleChartInterval.TWELVE_HOURS,
  CandleChartInterval.ONE_DAY,
  CandleChartInterval.ONE_WEEK,
];

// Supported time frame by the robot in backtest
export const supportedTimeFramesBacktest = [
  CandleChartInterval.ONE_MINUTE,
  CandleChartInterval.FIVE_MINUTES,
  CandleChartInterval.FIFTEEN_MINUTES,
  CandleChartInterval.THIRTY_MINUTES,
  CandleChartInterval.ONE_HOUR,
  CandleChartInterval.TWO_HOURS,
  CandleChartInterval.FOUR_HOURS,
  CandleChartInterval.SIX_HOURS,
  CandleChartInterval.TWELVE_HOURS,
  CandleChartInterval.ONE_DAY,
];

const loopTimeFramesFromConfig = Config.map((config) => config.loopInterval);
const indicatorIntervalsFromConfig = Config.reduce((prev, cur) => {
  return prev.concat(
    cur.indicatorIntervals
      .map((interval) => {
        if (!prev.some((i) => i === interval)) return interval;
      })
      .filter((interval) => interval !== null || interval !== undefined)
  );
}, []);

const isSupportedTimeFrames = (timeFrames: CandleChartInterval[]) => {
  return !timeFrames
    .map((timeFrame) => supportedTimeFrames.includes(timeFrame))
    .some((result) => result === false);
};

const isSupportedTimeFramesInBackTest = (timeFrames: CandleChartInterval[]) => {
  return !timeFrames
    .map((timeFrame) => supportedTimeFramesBacktest.includes(timeFrame))
    .some((result) => result === false);
};

if (process.env.NODE_ENV !== 'test') {
  if (
    !isSupportedTimeFrames([
      ...loopTimeFramesFromConfig,
      ...indicatorIntervalsFromConfig,
    ])
  ) {
    console.error(`You use a time frame not supported by the robot.`);
    process.exit(1);
  } else {
    const tradingBot = new Bot(Config);
    tradingBot.prepare();
    tradingBot.run();
  }
} else {
  if (
    !isSupportedTimeFramesInBackTest([
      ...loopTimeFramesFromConfig,
      ...indicatorIntervalsFromConfig,
    ])
  ) {
    console.error(`You use a time frame not supported in backtest mode.`);
    process.exit(1);
  } else {
    //////////// Backtester parameters /////////////////////
    const startDate = new Date('2021-01-01 00:00:00');
    const endDate = new Date('2022-01-01 00:00:00');
    const initialCapital = 10000;
    const strategyName = 'stochastic_rsi';
    ////////////////////////////////////////////////////////

    const bot = new BackTestBot(
      Config,
      strategyName,
      startDate,
      endDate,
      initialCapital
    );
    bot.prepare();
    bot.run();
  }
}
