import { CandleChartInterval } from 'binance-api-node';
import fs from 'fs';
import path from 'path';

export const loadStrategyConfig = (strategyConfigName: string) => {
  if (
    !fs.existsSync(
      path.resolve(process.cwd(), 'src/configs', `${strategyConfigName}.ts`)
    )
  ) {
    console.error(`The trading config "${strategyConfigName}" doesn't exists.`);
    process.exit(1);
    return;
  }

  // Import the strategy config
  const { config, hyperParameters } =
    require(`../configs/${strategyConfigName}`) as {
      hyperParameters: HyperParameters;
      config: AbstractStrategyConfig;
    };

  const AbstractStrategy = config;
  const StrategyConfig = config(hyperParameters);
  const StrategyHyperParameters = hyperParameters;

  // Supported time frame by the robot in development and production mode
  const supportedTimeFrames = [
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

  // Supported time frame by the robot in backtest mode
  const supportedTimeFramesBacktest = [
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

  const loopTimeFramesFromConfig = StrategyConfig.map(
    (config) => config.loopInterval
  );

  const indicatorIntervalsFromConfig = StrategyConfig.reduce((prev, cur) => {
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

  const isSupportedTimeFramesInBackTest = (
    timeFrames: CandleChartInterval[]
  ) => {
    return !timeFrames
      .map((timeFrame) => supportedTimeFramesBacktest.includes(timeFrame))
      .some((result) => result === false);
  };

  if (
    !isSupportedTimeFrames([
      ...loopTimeFramesFromConfig,
      ...indicatorIntervalsFromConfig,
    ])
  ) {
    console.error(`You use a time frame not supported by the robot.`);
    process.exit(1);
  }

  if (
    !isSupportedTimeFramesInBackTest([
      ...loopTimeFramesFromConfig,
      ...indicatorIntervalsFromConfig,
    ])
  ) {
    console.error(`You use a time frame not supported in backtest mode.`);
    process.exit(1);
  }

  return { AbstractStrategy, StrategyConfig, StrategyHyperParameters };
};
