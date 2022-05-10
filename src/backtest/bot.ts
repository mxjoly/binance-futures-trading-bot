import colors from 'ansi-colors';
import { CandleChartInterval, ExchangeInfo, OrderSide } from 'binance-api-node';
import chalk from 'chalk';
import cliProgress from 'cli-progress';
import dayjs from 'dayjs';
import safeRequire from 'safe-require';
import { binanceClient, MAX_LOADED_CANDLE_LENGTH_API } from '../init';
import { decimalCeil, decimalFloor } from '../utils/math';
import { clone } from '../utils/object';
import { loadCandlesMultiTimeFramesFromCSV } from '../utils/loadCandleData';
import { isOnTradingSession } from '../utils/tradingSession';
import { createDatabase, saveState } from './database';
import generateHtmlReport from './generateHtmlReport';
import { Counter } from '../tools/counter';
import { calculateActivationPrice } from '../utils/trailingStop';
import {
  debugCandle,
  debugOpenOrders,
  debugWallet,
  log,
  printDateBanner,
} from './debug';
import {
  getPricePrecision,
  getQuantityPrecision,
  isValidQuantity,
} from '../utils/currencyInfo';
import {
  compareTimeFrame,
  dateMatchTimeFrame,
  durationBetweenDates,
  timeFrameToMinutes,
} from '../utils/timeFrame';

// ====================================================================== //

const BotConfig = safeRequire(`${process.cwd()}/config.json`);

if (!BotConfig) {
  console.error(
    'Something is wrong. No json config file has been found at the root of the project.'
  );
  process.exit(1);
}

const BacktestConfig = BotConfig['backtest'];

// ====================================================================== //

const bar = new cliProgress.SingleBar(
  {
    format:
      'Progress: |' + colors.blue('{bar}') + '| {percentage}% | date: {date}',
  },
  cliProgress.Presets.shades_classic
);

// ====================================================================== //

// Save the backtest history to the database
const SAVE_HISTORY = BacktestConfig['save_db'];

// Debug mode with console.log
export const DEBUG = process.argv[2]
  ? process.argv[2].split('=')[1] === 'true'
    ? true
    : false
  : false;

// Exchange fee info
const TAKER_FEES = BotConfig['taker_fees_futures']; // %
const MAKER_FEES = BotConfig['maker_fees_futures']; // %

// ====================================================================== //

let candleDataCache: {
  [symbol: string]: CandlesDataMultiTimeFrames;
} = null;

// ====================================================================== //

/**
 * Basic class
 */
export class BasicBackTestBot {
  // Configuration
  private strategyConfigs: StrategyConfig[];
  private strategyHyperParameters: HyperParameters;
  private strategyName: string;

  // Candles
  private historicCandleDataMultiTimeFrames: {
    [symbol: string]: CandlesDataMultiTimeFrames;
  } = {};

  // Counter to fix the max duration of each trade
  private counters: { [symbol: string]: Counter } = {};

  // Historic of trades
  private tradesHistoric: TradesHistoric = [];

  // Initial parameters
  private startDate: Date;
  private endDate: Date;
  private initialCapital: number;

  // Account mocks
  private wallet: Wallet;
  private openOrders: OpenOrder[];

  // For the calculation of some properties of the strategy report
  public strategyReport: StrategyReport = {};
  private generateReport: boolean;
  private maxBalance: number;
  private maxAbsoluteDrawdown = 1;
  private maxRelativeDrawdown = 1;
  private maxProfit = 0;
  private maxLoss = 0;
  private maxConsecutiveWinsCount = 0;
  private maxConsecutiveLossesCount = 0;
  private maxConsecutiveProfitCount = 0;
  private maxConsecutiveLossCount = 0;

  // To generate the html report
  private chartLabels: string[] = [];
  private chartData: number[] = [];

  constructor(
    strategyConfigs: StrategyConfig[],
    strategyHyperParameters: HyperParameters,
    strategyName: string,
    startDate: Date,
    endDate: Date,
    initialCapital: number,
    generateReport = true
  ) {
    this.strategyConfigs = strategyConfigs;
    this.strategyHyperParameters = strategyHyperParameters;
    this.strategyName = strategyName;
    this.startDate = startDate;
    this.endDate = endDate;
    this.initialCapital = initialCapital;
    this.maxBalance = initialCapital;
    this.generateReport = generateReport;
  }

  /**
   * Prepare the mock account data, the open orders, and initialize some properties of the strategy report
   */
  public prepare() {
    if (SAVE_HISTORY) createDatabase(this.strategyName);

    this.wallet = {
      availableBalance: this.initialCapital,
      totalWalletBalance: this.initialCapital,
      totalUnrealizedProfit: 0,
      positions: this.strategyConfigs.map(({ asset, base, leverage }) => ({
        pair: asset + base,
        leverage,
        entryPrice: 0,
        margin: 0,
        positionSide: 'LONG',
        unrealizedProfit: 0,
        size: 0,
      })),
    };
    this.openOrders = [];

    // Initialize the counters
    this.strategyConfigs.forEach(({ asset, base, maxTradeDuration }) => {
      if (maxTradeDuration)
        this.counters[asset + base] = new Counter(maxTradeDuration);
    });

    this.prepareStrategyReport();
  }

  /**
   * Initialize some properties of the strategy report
   */
  private prepareStrategyReport() {
    this.strategyReport.initialCapital = this.initialCapital;
    this.strategyReport.numberSymbol = this.wallet.positions.length;
    this.strategyReport.totalNetProfit = 0;
    this.strategyReport.totalFees = 0;
    this.strategyReport.totalTrades = 0;
    this.strategyReport.totalLongTrades = 0;
    this.strategyReport.totalShortTrades = 0;
    this.strategyReport.totalProfit = 0;
    this.strategyReport.totalLoss = 0;
    this.strategyReport.longWinningTrade = 0;
    this.strategyReport.longLostTrade = 0;
    this.strategyReport.shortWinningTrade = 0;
    this.strategyReport.shortLostTrade = 0;
    this.strategyReport.maxConsecutiveProfit = 0;
    this.strategyReport.maxConsecutiveLoss = 0;
    this.strategyReport.maxConsecutiveWinsCount = 0;
    this.strategyReport.maxConsecutiveLossesCount = 0;
  }

  /**
   * Load the candles from the downloaded data
   */
  private async prepareCandleHistoric(strategyConfigs: StrategyConfig[]) {
    if (candleDataCache) {
      this.historicCandleDataMultiTimeFrames = candleDataCache;
    } else {
      let loadData: Promise<{
        pair: string;
        candles: CandlesDataMultiTimeFrames;
      }>[] = [];

      // Load all the data for all the symbols
      strategyConfigs.forEach(async (strategyConfig) => {
        let pair = strategyConfig.asset + strategyConfig.base;
        loadData.push(
          new Promise<{ pair: string; candles: CandlesDataMultiTimeFrames }>(
            (resolve, reject) => {
              loadCandlesMultiTimeFramesFromCSV(
                strategyConfig.asset + strategyConfig.base,
                Array.from(
                  new Set([
                    strategyConfig.loopInterval,
                    ...strategyConfig.indicatorIntervals,
                  ])
                ),
                this.startDate,
                this.endDate
              )
                .then((candles) => {
                  resolve({ pair, candles });
                })
                .catch(reject);
            }
          )
        );
      });

      await Promise.all(loadData).then((data) => {
        data.forEach(({ pair, candles }) => {
          this.historicCandleDataMultiTimeFrames[pair] = candles;
        });
      });
    }

    // Save to cache
    candleDataCache = this.historicCandleDataMultiTimeFrames;

    // Check if the candles has been loaded successfully. If not, stop the backtesting
    let historyError = false;
    this.strategyConfigs.forEach(({ asset, base }) => {
      Object.keys(this.historicCandleDataMultiTimeFrames[asset + base]).forEach(
        (interval) => {
          if (
            this.historicCandleDataMultiTimeFrames[asset + base][interval]
              .length === 0
          ) {
            historyError = true;
            console.error(
              `No candle data has been found on the pair ${
                asset + base
              } and time frame ${interval} for the period: ${dayjs(
                this.startDate
              ).format('YYYY-MM-DD HH:mm:ss')} to ${dayjs(this.endDate).format(
                'YYYY-MM-DD HH:mm:ss'
              )}`
            );
          }
        }
      );
    });
    if (historyError) return process.exit();

    // Check the start date and end date comparing to the date range of the historic data downloaded
    Object.keys(this.historicCandleDataMultiTimeFrames).forEach((pair) => {
      let candles = this.historicCandleDataMultiTimeFrames[pair];
      Object.keys(this.historicCandleDataMultiTimeFrames[pair]).forEach(
        (timeFrame) => {
          let candleTimeFrame = candles[timeFrame];
          let startDate = candleTimeFrame[0].openTime;
          let endDate = dayjs(
            candleTimeFrame[candleTimeFrame.length - 1].openTime
          ).add(1, 'minute');
          if (dayjs(startDate).isBefore(this.startDate)) {
            console.warn(
              `Your start date is too old comparing to your downloaded candle data for ${pair} in ${timeFrame}. The earliest possible date is ${dayjs(
                startDate
              ).format('YYYY-MM-DD HH:mm:ss')}\n`
            );
          }
          if (dayjs(endDate).isAfter(this.endDate)) {
            console.warn(
              `Your end date is too recent comparing to your downloaded candle data for ${pair} in ${timeFrame}. The latest possible date is ${dayjs(
                endDate
              ).format('YYYY-MM-DD HH:mm:ss')}\n`
            );
          }
        }
      );
    });
  }

  /**
   * Main function
   */
  public async run() {
    log(
      '====================== 💵 BINANCE TRADING BOT (BACKTEST) 💵 ======================'
    );

    // Get exchange info (account information are incomplete in the testnet)
    const exchangeInfo = await binanceClient.futuresExchangeInfo();

    // Prepare the candle data that will be used in the backtester
    await this.prepareCandleHistoric(this.strategyConfigs);

    // Get the smaller loop time frame in the strategy configs.
    const smallerTimeFrame = this.strategyConfigs
      .map(({ loopInterval }) => loopInterval)
      .sort((tf1, tf2) => compareTimeFrame(tf1, tf2))[0];

    // Duration of the backtest in the nit of the smaller time frame
    const duration = durationBetweenDates(
      this.startDate,
      this.endDate,
      smallerTimeFrame
    );

    // Set property for strategy
    this.strategyReport.totalBars = duration;

    // Initiation of CLI Progress bar
    if (!DEBUG) bar.start(duration, 0);

    // Indexes to generate candle data arrays progressively (real time)
    let indexes: {
      [pair: string]: { [timeFrame: string]: { start: number; end: number } };
    } = {};

    // Initialize the indexes
    this.strategyConfigs.forEach(
      ({ asset, base, indicatorIntervals, loopInterval }) => {
        indexes[asset + base] = {};
        new Set([loopInterval, ...indicatorIntervals]).forEach((interval) => {
          indexes[asset + base][interval] = { start: 0, end: 0 };
        });
      }
    );

    // Mock date fir the backtesting
    let currentDate = this.startDate;

    // Time loop
    while (dayjs(currentDate).isSameOrBefore(this.endDate)) {
      printDateBanner(currentDate);

      this.strategyConfigs.forEach((strategyConfig) => {
        const { base, asset, loopInterval, indicatorIntervals } =
          strategyConfig;
        const pair = asset + base;

        // Update the indexes of the candle data array for each time frames
        new Set([loopInterval, ...indicatorIntervals]).forEach((interval) => {
          let { indexStart, indexEnd } = this.updateCandleDataIndexes(
            indexes[pair][interval].start,
            indexes[pair][interval].end,
            pair,
            interval,
            currentDate
          );
          indexes[pair][interval].start = indexStart;
          indexes[pair][interval].end = indexEnd;
        });

        // Use two arrays, one containing all the data for each time frames, the second
        // with only the candle data on the loop time frame specified in the trade configuration
        let candles = this.generateCandleDataFromIndexes(pair, indexes[pair]);
        let candlesStream: CandleData[] = candles[pair][loopInterval];

        if (candlesStream.length >= MAX_LOADED_CANDLE_LENGTH_API) {
          const currentCandle = candlesStream[candlesStream.length - 1];
          const currentPrice = currentCandle.close;

          debugCandle(currentCandle);

          // The loop time frames could be different of the smaller time frame for all the trading configurations
          if (dateMatchTimeFrame(currentDate, strategyConfig.loopInterval)) {
            this.trade(
              strategyConfig,
              currentPrice,
              candles[pair],
              exchangeInfo
            );
            this.updatePNL(
              strategyConfig.asset,
              strategyConfig.base,
              currentPrice
            );
          }

          // Check the current trades/positions
          this.checkPositionMargin(pair, currentPrice); // If the position margin reach 0, close the position (liquidation)
          this.checkOpenOrders(asset, base, currentCandle);
        }
      });

      // Update the max drawdown and max balance property for the strategy report
      this.updateMaxDrawdownMaxBalance();

      // Update the total unrealized pnl on the futures account
      this.updateTotalPNL();

      // Save the current state to the db
      if (SAVE_HISTORY) this.saveStateToDB(currentDate);

      // Debugging
      debugWallet(this.wallet);
      debugOpenOrders(this.openOrders);
      log(''); // \n

      if (!DEBUG)
        bar.increment(1, {
          date: dayjs(currentDate).format('YYYY-MM-DD HH:mm'),
        });

      // Preparing chart data for the strategy report in html
      this.chartLabels.push(dayjs(currentDate).format('YYYY-MM-DD'));
      this.chartData.push(this.wallet.totalWalletBalance);

      // Increment the date with the smaller time frame (interval)
      currentDate = dayjs(currentDate)
        .add(timeFrameToMinutes(smallerTimeFrame), 'minute')
        .toDate();
    }

    if (!DEBUG) bar.stop();

    // Display the strategy report
    this.calculateStrategyStats();
    if (this.generateReport) {
      this.displayStrategyReport();
      generateHtmlReport(
        this.strategyName,
        this.strategyHyperParameters,
        this.strategyReport,
        this.tradesHistoric,
        this.chartLabels,
        this.chartData
      );
    }
  }

  /**
   * Update all date range of the current candle data (used the main loop) from the initial historic data downloaded.
   */
  private generateCandleDataFromIndexes(
    pair: string,
    pairIndexes: { [timeFrame: string]: { start: number; end: number } }
  ) {
    let candles: {
      [symbol: string]: CandlesDataMultiTimeFrames;
    } = {};

    Object.keys(this.historicCandleDataMultiTimeFrames).forEach(
      (pair) => (candles[pair] = {})
    );

    Object.entries(this.historicCandleDataMultiTimeFrames[pair]).forEach(
      ([timeFrame, data]: [CandleChartInterval, CandleData[]]) => {
        candles[pair][timeFrame] = data.slice(
          pairIndexes[timeFrame].start,
          pairIndexes[timeFrame].end
        );
      }
    );

    return candles;
  }

  /**
   * Get the new index (start and end) for the candle data of a pair and a time frame
   * @param indexStart
   * @param indexEnd
   * @param pair
   * @param timeFrame
   * @param currentDate
   */
  private updateCandleDataIndexes(
    indexStart: number,
    indexEnd: number,
    pair: string,
    timeFrame: CandleChartInterval,
    currentDate: Date
  ) {
    for (
      let i = indexEnd;
      i < this.historicCandleDataMultiTimeFrames[pair][timeFrame].length;
      i++
    ) {
      let pairCandles = this.historicCandleDataMultiTimeFrames[pair][timeFrame];

      // When the date of candle data at the index end is after the current date, stop the loop because the end index has been found
      if (dayjs(pairCandles[i].closeTime).isAfter(currentDate) && i > 0) {
        indexEnd = i - 1;
        break;
      }

      // Update the index start to have the same range between the index start and index end
      if (i - indexStart > MAX_LOADED_CANDLE_LENGTH_API) indexStart++;
    }

    return { indexStart, indexEnd };
  }

  /**
   * Calculation/adjustment before displaying the strategy report
   */
  private calculateStrategyStats() {
    let {
      totalLongTrades,
      totalShortTrades,
      longWinningTrade,
      shortWinningTrade,
      longLostTrade,
      shortLostTrade,
      totalTrades,
      totalProfit,
      totalLoss,
      totalFees,
    } = this.strategyReport;

    this.strategyReport.testPeriod = `${dayjs(this.startDate).format(
      'YYYY-MM-DD HH:mm:ss'
    )} to ${dayjs(this.endDate).format('YYYY-MM-DD HH:mm:ss')}`;
    this.strategyReport.finalCapital = decimalFloor(
      this.wallet.totalWalletBalance,
      2
    );
    this.strategyReport.totalNetProfit = decimalFloor(
      this.wallet.totalWalletBalance - this.initialCapital,
      2
    );
    this.strategyReport.totalProfit = decimalFloor(
      this.strategyReport.totalProfit,
      2
    );
    this.strategyReport.totalLoss = decimalFloor(
      this.strategyReport.totalLoss,
      2
    );
    this.strategyReport.totalFees = -decimalFloor(
      this.strategyReport.totalFees,
      2
    );
    this.strategyReport.profitFactor = decimalFloor(
      totalProfit / (Math.abs(totalLoss) + totalFees),
      2
    );
    this.strategyReport.maxAbsoluteDrawdown = -decimalFloor(
      (1 - this.maxAbsoluteDrawdown) * 100,
      2
    );
    this.strategyReport.maxRelativeDrawdown = decimalCeil(
      this.maxRelativeDrawdown * 100,
      2
    );

    this.strategyReport.longWinRate = decimalFloor(
      (longWinningTrade / totalLongTrades) * 100,
      2
    );
    this.strategyReport.shortWinRate = decimalFloor(
      (shortWinningTrade / totalShortTrades) * 100,
      2
    );
    this.strategyReport.totalWinRate = decimalFloor(
      ((longWinningTrade + shortWinningTrade) / totalTrades) * 100,
      2
    );
    this.strategyReport.maxProfit = decimalFloor(this.maxProfit, 2);
    this.strategyReport.maxLoss = -decimalFloor(this.maxLoss, 2);
    this.strategyReport.avgProfit = decimalFloor(
      totalProfit / (longWinningTrade + shortWinningTrade),
      2
    );
    this.strategyReport.avgLoss = decimalFloor(
      totalLoss / (longLostTrade + shortLostTrade),
      2
    );
    this.strategyReport.maxConsecutiveWinsCount = this.maxConsecutiveWinsCount;
    this.strategyReport.maxConsecutiveLossesCount =
      this.maxConsecutiveLossesCount;
    this.strategyReport.maxConsecutiveProfit = decimalFloor(
      this.maxConsecutiveProfitCount,
      2
    );
    this.strategyReport.maxConsecutiveLoss = -decimalFloor(
      this.maxConsecutiveLossCount,
      2
    );
  }

  /**
   * Function that displays the strategy report
   */
  private displayStrategyReport() {
    const {
      testPeriod,
      initialCapital,
      finalCapital,
      totalBars,
      totalNetProfit,
      totalProfit,
      totalLoss,
      totalFees,
      profitFactor,
      totalTrades,
      totalWinRate,
      longWinRate,
      shortWinRate,
      longWinningTrade,
      shortWinningTrade,
      totalLongTrades,
      totalShortTrades,
      maxProfit,
      maxLoss,
      avgProfit,
      avgLoss,
      maxAbsoluteDrawdown,
      maxRelativeDrawdown,
      maxConsecutiveProfit,
      maxConsecutiveLoss,
      maxConsecutiveWinsCount,
      maxConsecutiveLossesCount,
    } = this.strategyReport;

    let strategyReportString = `\n========================= STRATEGY REPORT =========================\n
    Period: ${testPeriod}
    Total bars: ${totalBars}
    ----------------------------------------------------------
    Initial capital: ${initialCapital}
    Final capital: ${finalCapital}
    Total net profit: ${totalNetProfit}
    Total profit: ${totalProfit}
    Total loss: ${totalLoss}
    Total fees: ${totalFees}
    Profit factor: ${profitFactor}
    Max absolute drawdown: ${maxAbsoluteDrawdown}%
    Max relative drawdown: ${maxRelativeDrawdown}%
    ----------------------------------------------------------
    Total trades: ${totalTrades}
    Total win rate: ${totalWinRate}%
    Long trades won: ${longWinRate}% (${longWinningTrade}/${totalLongTrades})
    Short trades won: ${shortWinRate}% (${shortWinningTrade}/${totalShortTrades})
    Max profit: ${maxProfit}
    Max loss: ${maxLoss}
    Average profit: ${avgProfit}
    Average loss: ${avgLoss}
    Max consecutive profit: ${maxConsecutiveProfit}
    Max consecutive loss: ${maxConsecutiveLoss}
    Max consecutive wins (count): ${maxConsecutiveWinsCount}
    Max consecutive losses (count): ${maxConsecutiveLossesCount}
    `;

    console.log(strategyReportString);
  }

  /**
   * Update the max drawdown and max balance with the current state of the wallet
   */
  private updateMaxDrawdownMaxBalance() {
    // Max balance update
    if (this.wallet.totalWalletBalance > this.maxBalance) {
      this.maxBalance = this.wallet.totalWalletBalance;
    }
    // Max absolute drawdown update
    let absoluteDrawdown = this.wallet.totalWalletBalance / this.maxBalance;
    if (absoluteDrawdown < this.maxAbsoluteDrawdown) {
      this.maxAbsoluteDrawdown = absoluteDrawdown;
    }
    // Max relative drawdown update
    let relativeDrawdown =
      (this.wallet.totalWalletBalance - this.maxBalance) / this.maxBalance;
    if (relativeDrawdown < this.maxRelativeDrawdown) {
      this.maxRelativeDrawdown = relativeDrawdown;
    }
  }

  /**
   * Update the properties of the strategy report linked to the calculation of profit and loss
   * (total profit/loss, max consecutive wins/losses count, max consecutive win/ loss)
   * @param pnl the current pnl
   */
  private updateProfitLossStrategyProperty(pnl: number) {
    if (pnl > 0) {
      this.strategyReport.totalProfit += pnl;
      this.strategyReport.maxConsecutiveWinsCount++;
      this.strategyReport.maxConsecutiveProfit += Math.abs(pnl);

      if (
        this.strategyReport.maxConsecutiveLossesCount >
        this.maxConsecutiveLossesCount
      )
        this.maxConsecutiveLossesCount =
          this.strategyReport.maxConsecutiveLossesCount;

      if (this.strategyReport.maxConsecutiveLoss > this.maxConsecutiveLossCount)
        this.maxConsecutiveLossCount = this.strategyReport.maxConsecutiveLoss;

      this.strategyReport.maxConsecutiveLossesCount = 0;
      this.strategyReport.maxConsecutiveLoss = 0;

      if (Math.abs(pnl) > this.maxProfit) this.maxProfit = Math.abs(pnl);
    }

    if (pnl < 0) {
      this.strategyReport.totalLoss += pnl;
      this.strategyReport.maxConsecutiveLossesCount++;
      this.strategyReport.maxConsecutiveLoss += Math.abs(pnl);

      if (
        this.strategyReport.maxConsecutiveWinsCount >
        this.maxConsecutiveWinsCount
      )
        this.maxConsecutiveWinsCount =
          this.strategyReport.maxConsecutiveWinsCount;

      if (
        this.strategyReport.maxConsecutiveProfit >
        this.maxConsecutiveProfitCount
      )
        this.maxConsecutiveProfitCount =
          this.strategyReport.maxConsecutiveProfit;

      this.strategyReport.maxConsecutiveWinsCount = 0;
      this.strategyReport.maxConsecutiveProfit = 0;

      if (Math.abs(pnl) > this.maxLoss) this.maxLoss = Math.abs(pnl);
    }
  }

  /**
   * Save the current account state in the json database
   */
  private saveStateToDB(currentDate: Date) {
    saveState(
      dayjs(currentDate).format('YYYY-MM-DD HH:mm'),
      clone(this.wallet),
      clone(this.openOrders)
    );
  }

  /**
   * Add a row to the historic of trades
   * @param date
   * @param symbol
   * @param type
   * @param type
   * @param action
   * @param size
   * @param price
   * @param pnl
   */
  private addToHistoric(
    date: Date,
    symbol: string,
    side: 'BUY' | 'SELL',
    type: 'MARKET' | 'LIMIT' | 'STOP' | 'TRAILING_STOP_MARKET',
    action: 'OPEN' | 'CLOSE',
    size: number,
    price: number,
    pnl: number
  ) {
    let row: TradesHistoricRow = {
      date,
      symbol,
      side,
      type,
      action,
      size,
      price,
      pnl,
      balance: this.wallet.totalWalletBalance,
    };
    this.tradesHistoric.push(row);
  }

  /**
   * Main function for the futures mode
   * @param strategyConfig
   * @param currentPrice
   * @param candles
   * @param exchangeInfo
   */
  private trade(
    strategyConfig: StrategyConfig,
    currentPrice: number,
    candles: CandlesDataMultiTimeFrames,
    exchangeInfo: ExchangeInfo
  ) {
    const {
      asset,
      base,
      risk,
      exitStrategy,
      trendFilter,
      riskManagement,
      buyStrategy,
      sellStrategy,
      tradingSessions,
      canOpenNewPositionToCloseLast,
      trailingStopConfig,
      allowPyramiding,
      maxPyramidingAllocation,
      unidirectional,
      loopInterval,
      maxTradeDuration,
    } = strategyConfig;
    const pair = asset + base;
    const date = new Date(
      candles[strategyConfig.loopInterval].slice(-1)[0].openTime
    );

    // Balance information
    const assetBalance = this.wallet.totalWalletBalance;
    const availableBalance = this.wallet.availableBalance;

    // Position information
    const positions = this.wallet.positions;
    const position = positions.find((position) => position.pair === pair);
    const hasLongPosition = position.size > 0;
    const hasShortPosition = position.size < 0;
    const pnl = this.getPositionPNL(position, currentPrice);

    // Open orders
    const currentOpenOrders = this.openOrders.filter(
      (order) => order.pair === pair
    );

    // Check the trend
    const useLongPosition = trendFilter ? trendFilter(candles) === 1 : true;
    const useShortPosition = trendFilter ? trendFilter(candles) === -1 : true;

    // Conditions to take or not a position
    const canAddToPosition = allowPyramiding
      ? position.margin + assetBalance * risk <=
        assetBalance * maxPyramidingAllocation
      : false;
    const canTakeLongPosition =
      (canOpenNewPositionToCloseLast && hasShortPosition) ||
      (!canOpenNewPositionToCloseLast &&
        hasShortPosition &&
        currentOpenOrders.length === 0) ||
      (!allowPyramiding && !hasLongPosition) ||
      (allowPyramiding && hasShortPosition && currentOpenOrders.length === 0) ||
      (allowPyramiding &&
        hasShortPosition &&
        currentOpenOrders.length > 0 &&
        canOpenNewPositionToCloseLast);
    const canTakeShortPosition =
      (canOpenNewPositionToCloseLast && hasLongPosition) ||
      (!canOpenNewPositionToCloseLast &&
        hasLongPosition &&
        currentOpenOrders.length === 0) ||
      (!allowPyramiding && !hasShortPosition) ||
      (allowPyramiding && hasLongPosition && currentOpenOrders.length === 0) ||
      (allowPyramiding &&
        hasLongPosition &&
        currentOpenOrders.length > 0 &&
        canOpenNewPositionToCloseLast);

    // Currency infos
    const pricePrecision = getPricePrecision(pair, exchangeInfo);
    const quantityPrecision = getQuantityPrecision(pair, exchangeInfo);

    // Check if we are in the trading sessions
    const isTradingSessionActive = isOnTradingSession(
      candles[loopInterval][candles[loopInterval].length - 1].closeTime,
      tradingSessions
    );

    // The current position is too long
    if (
      maxTradeDuration &&
      (hasShortPosition || hasLongPosition) &&
      this.counters[pair]
    ) {
      this.counters[pair].decrement();
      if (this.counters[pair].getValue() == 0) {
        log(
          `The position on ${pair} is longer that the maximum authorized duration. Position has been closed.`
        );
        this.order({
          pair,
          price: currentPrice,
          quantity: Math.abs(position.size),
          side: hasLongPosition ? 'SELL' : 'BUY',
          type: 'MARKET',
        });
        this.counters[pair].reset();
        this.closeOpenOrders(pair);
        this.addToHistoric(
          date,
          pair,
          'SELL',
          'MARKET',
          'CLOSE',
          Math.abs(position.size),
          currentPrice,
          pnl
        );
        return;
      }
    }

    // Prevent remaining open orders when all the take profit or a stop loss has been filled
    if (!hasLongPosition && !hasShortPosition && currentOpenOrders.length > 0) {
      this.closeOpenOrders(pair);
    }

    // Reset the counter if a previous trade close a the position
    if (
      maxTradeDuration &&
      !hasLongPosition &&
      !hasShortPosition &&
      this.counters[pair].getValue() < maxTradeDuration
    ) {
      this.counters[pair].reset();
    }

    if (
      (isTradingSessionActive || position.size !== 0) &&
      canTakeLongPosition &&
      buyStrategy(candles)
    ) {
      // Take the profit and not open a new position
      if (hasShortPosition && unidirectional) {
        this.order({
          pair,
          price: currentPrice,
          quantity: Math.abs(position.size),
          side: 'BUY',
          type: 'MARKET',
        });
        this.closeOpenOrders(pair);
        this.addToHistoric(
          date,
          pair,
          'BUY',
          'MARKET',
          'CLOSE',
          Math.abs(position.size),
          currentPrice,
          pnl
        );
        return;
      }

      // Do not trade with long position if the trend is down
      if (!useLongPosition) return;

      // Do not add to the current position if the allocation is over the max allocation
      if (allowPyramiding && hasLongPosition && !canAddToPosition) return;

      // Calculate TP and SL
      let { takeProfits, stopLoss } =
        !allowPyramiding && exitStrategy
          ? exitStrategy(
              currentPrice,
              candles,
              pricePrecision,
              OrderSide.BUY,
              exchangeInfo
            )
          : { takeProfits: [], stopLoss: null };

      // Calculation of the quantity for the position according to the risk management
      let quantity = riskManagement({
        asset,
        base,
        balance: allowPyramiding
          ? Number(assetBalance)
          : Number(availableBalance),
        risk,
        enterPrice: currentPrice,
        stopLossPrice: stopLoss,
        exchangeInfo,
      });

      // Quantity to add to close the previous position
      let previousPositionQuantity = hasShortPosition
        ? Math.abs(position.size)
        : 0;

      // To close the previous short position
      if (
        isValidQuantity(quantity + previousPositionQuantity, pair, exchangeInfo)
      ) {
        quantity += previousPositionQuantity;
      } else {
        throw new Error(`Invalid quantity order for ${pair}: ${quantity}`);
      }

      this.order({
        pair,
        price: currentPrice,
        quantity,
        side: 'BUY',
        type: 'MARKET',
      });

      this.addToHistoric(
        date,
        pair,
        'BUY',
        'MARKET',
        'OPEN',
        Math.abs(position.size),
        currentPrice,
        null
      );

      // Cancel the previous orders to update them
      if (currentOpenOrders.length > 0) {
        this.closeOpenOrders(pair);
      }

      // In pyramiding mode, update the take profits and stop loss
      if (allowPyramiding && hasLongPosition) {
        let { takeProfits: updatedTakeProfits, stopLoss: updatedStopLoss } =
          exitStrategy
            ? exitStrategy(
                position.entryPrice,
                candles,
                pricePrecision,
                OrderSide.BUY,
                exchangeInfo
              )
            : { takeProfits: [], stopLoss: null };
        takeProfits = updatedTakeProfits;
        stopLoss = updatedStopLoss;
      }

      if (takeProfits.length > 0) {
        // Create the take profit orders
        takeProfits.forEach(({ price, quantityPercentage }) => {
          this.order({
            pair,
            price,
            quantity: Math.abs(position.size) * quantityPercentage,
            side: 'SELL',
            type: 'LIMIT',
          });
        });
      }

      if (stopLoss) {
        // Limit order as SL
        this.order({
          pair,
          price: stopLoss,
          quantity: Math.abs(position.size),
          side: 'SELL',
          type: 'STOP',
        });
      }

      if (trailingStopConfig) {
        let activationPrice = calculateActivationPrice(
          position.entryPrice,
          pricePrecision,
          OrderSide.SELL,
          trailingStopConfig,
          takeProfits
        );

        this.order({
          pair: asset + base,
          price: activationPrice,
          quantity: Math.abs(position.size),
          side: 'SELL',
          type: 'TRAILING_STOP_MARKET',
          trailingStopConfig,
        });
      }
    } else if (
      (isTradingSessionActive || position.size !== 0) &&
      canTakeShortPosition &&
      sellStrategy(candles)
    ) {
      // Take the profit and not open a new position
      if (hasLongPosition && unidirectional) {
        this.order({
          pair,
          price: currentPrice,
          quantity: Math.abs(position.size),
          side: 'SELL',
          type: 'MARKET',
        });
        this.closeOpenOrders(pair);
        this.addToHistoric(
          date,
          pair,
          'SELL',
          'MARKET',
          'CLOSE',
          Math.abs(position.size),
          currentPrice,
          pnl
        );
        return;
      }

      // Do not trade with short position if the trend is up
      if (!useShortPosition) return;

      // Do not add to the current position if the allocation is over the max allocation
      if (allowPyramiding && hasShortPosition && !canAddToPosition) return;

      // Calculate TP and SL
      let { takeProfits, stopLoss } = exitStrategy
        ? exitStrategy(
            currentPrice,
            candles,
            pricePrecision,
            OrderSide.SELL,
            exchangeInfo
          )
        : { takeProfits: [], stopLoss: null };

      // Calculation of the quantity for the position according to the risk management
      let quantity = riskManagement({
        asset,
        base,
        balance: allowPyramiding
          ? Number(assetBalance)
          : Number(availableBalance),
        risk,
        enterPrice: currentPrice,
        stopLossPrice: stopLoss,
        exchangeInfo,
      });

      // Quantity to add to close the previous position
      let previousPositionQuantity = hasLongPosition
        ? Math.abs(position.size)
        : 0;

      // To close the previous long position
      if (
        isValidQuantity(quantity + previousPositionQuantity, pair, exchangeInfo)
      ) {
        quantity += previousPositionQuantity;
      } else {
        throw new Error(`Invalid quantity order for ${pair}: ${quantity}`);
      }

      this.order({
        pair,
        price: currentPrice,
        quantity,
        side: 'SELL',
        type: 'MARKET',
      });

      this.addToHistoric(
        date,
        pair,
        'SELL',
        'MARKET',
        'OPEN',
        Math.abs(position.size),
        currentPrice,
        pnl
      );

      // Cancel the previous orders to update them
      if (currentOpenOrders.length > 0) {
        this.closeOpenOrders(pair);
      }

      // In pyramiding mode, update the take profits and stop loss
      if (allowPyramiding && hasLongPosition) {
        let { takeProfits: updatedTakeProfits, stopLoss: updatedStopLoss } =
          exitStrategy
            ? exitStrategy(
                position.entryPrice,
                candles,
                pricePrecision,
                OrderSide.BUY,
                exchangeInfo
              )
            : { takeProfits: [], stopLoss: null };
        takeProfits = updatedTakeProfits;
        stopLoss = updatedStopLoss;
      }

      if (takeProfits.length > 0) {
        // Create the take profit orders
        takeProfits.forEach(({ price, quantityPercentage }) => {
          this.order({
            pair,
            price,
            quantity: Math.abs(position.size) * quantityPercentage,
            side: 'BUY',
            type: 'LIMIT',
          });
        });
      }

      if (stopLoss) {
        // Limit order as SL
        this.order({
          pair,
          price: stopLoss,
          quantity: Math.abs(position.size),
          side: 'BUY',
          type: 'STOP',
        });
      }

      if (trailingStopConfig) {
        let activationPrice = calculateActivationPrice(
          position.entryPrice,
          pricePrecision,
          OrderSide.BUY,
          trailingStopConfig,
          takeProfits
        );

        this.order({
          pair: asset + base,
          price: activationPrice,
          quantity: Math.abs(position.size),
          side: 'BUY',
          type: 'TRAILING_STOP_MARKET',
          trailingStopConfig,
        });
      }
    }
  }

  /**
   * Check if the margin is enough to maintain the position. If not, the position is liquidated
   * @param pair
   * @param currentPrice The current price in the main loop
   */
  private checkPositionMargin(pair: string, currentPrice: number) {
    const position = this.wallet.positions.find((pos) => pos.pair === pair);
    const { margin, unrealizedProfit, size, positionSide } = position;

    if (size !== 0 && margin + unrealizedProfit <= 0) {
      log(`The position on ${pair} has reached the liquidation price.`);
      this.order({
        pair,
        price: currentPrice,
        quantity: Math.abs(size),
        side: positionSide === 'LONG' ? 'SELL' : 'BUY',
        type: 'MARKET',
      });

      this.closeOpenOrders(pair);
      this.updateProfitLossStrategyProperty(unrealizedProfit);

      if (position.positionSide === 'LONG') this.strategyReport.longLostTrade++;
      else this.strategyReport.shortLostTrade++;
    }
  }

  /**
   * Check the open orders based on the current price. If the price crosses an order, this latter is activated.
   * @param asset
   * @param base
   * @param lastCandle
   */
  private checkOpenOrders(asset: string, base: string, lastCandle: CandleData) {
    if (this.openOrders.length > 0) {
      const pair = asset + base;
      const pairOrders = this.openOrders.filter((order) => order.pair === pair);
      const longOrders = pairOrders.filter((order) => order.side === 'BUY');
      const shortOrders = pairOrders.filter((order) => order.side === 'SELL');
      const position = this.wallet.positions.find(
        (position) => position.pair === pair
      );
      const wallet = this.wallet;
      const hasPosition = position.size !== 0;
      const date = new Date(lastCandle.openTime);

      // Check if a long order has been activated on the last candle
      longOrders
        .sort((order1, order2) => order2.price - order1.price) // sort orders from nearest price to furthest price
        .every(({ id, price, quantity, type, trailingStop }) => {
          const { entryPrice, size, leverage } = position;
          const fees = quantity * price * (MAKER_FEES / 100);

          // Price crossed the order
          if (
            (type === 'LIMIT' || type === 'STOP') &&
            lastCandle.high > price &&
            lastCandle.low < price
          ) {
            // Average the position
            if (position.positionSide === 'LONG') {
              let baseCost = (price * quantity) / leverage;

              // If there is enough available base
              if (wallet.availableBalance >= baseCost + fees) {
                let avgEntryPrice =
                  (price * quantity + entryPrice * Math.abs(size)) /
                  (quantity + Math.abs(size));

                position.margin += baseCost;
                position.size += quantity;
                position.entryPrice = avgEntryPrice;
                wallet.availableBalance -= baseCost + fees;
                wallet.totalWalletBalance -= fees;

                if (!hasPosition) {
                  this.strategyReport.totalTrades++;
                  this.strategyReport.totalLongTrades++;
                }
                this.strategyReport.totalFees += fees;

                this.addToHistoric(
                  date,
                  pair,
                  'BUY',
                  'LIMIT',
                  'OPEN',
                  size,
                  price,
                  null
                );

                log(
                  `Long order #${id} has been activated for ${quantity}${asset} at ${price}. Fees: ${fees}`,
                  chalk.magenta
                );
              }
            } else if (position.positionSide === 'SHORT') {
              // Update wallet
              let pnl = this.getPositionPNL(position, price);
              wallet.availableBalance += position.margin + pnl - fees;
              wallet.totalWalletBalance += pnl - fees;

              // Update strategy report
              this.updateProfitLossStrategyProperty(pnl);

              // Update position
              position.size += quantity;
              position.margin = Math.abs(position.size * price) / leverage;

              // The position has been closed
              if (position.size === 0) {
                position.entryPrice = 0;
                position.unrealizedProfit = 0;
              }

              // The position side has been changed
              if (position.size > 0) {
                position.entryPrice = price;
                position.positionSide = 'LONG';
                let newPnl = this.getPositionPNL(position, price);
                position.unrealizedProfit = newPnl;
                wallet.availableBalance -= position.margin;
                this.strategyReport.totalTrades++;
                this.strategyReport.totalLongTrades++;
              }

              if (hasPosition && entryPrice >= price)
                this.strategyReport.shortWinningTrade++;
              if (hasPosition && entryPrice < price)
                this.strategyReport.shortLostTrade++;
              this.strategyReport.totalFees += fees;

              this.addToHistoric(
                date,
                pair,
                'BUY',
                type,
                'CLOSE',
                Math.abs(size),
                price,
                pnl
              );

              log(
                `${
                  entryPrice < price
                    ? '[SL]'
                    : entryPrice > price
                    ? '[TP]'
                    : '[BE]'
                } Long order #${id} has been activated for ${quantity}${asset} at ${price}. Fees: ${fees}`,
                chalk.magenta
              );
            }

            this.closeOpenOrder(id);
          }

          // Trailing stops
          if (type === 'TRAILING_STOP_MARKET') {
            let activationPrice = price;
            let { status, callbackRate } = trailingStop;

            if (status === 'PENDING' && lastCandle.low <= activationPrice) {
              status = 'ACTIVE';
            }
            if (status === 'ACTIVE') {
              let stopLossPrice = lastCandle.open * (1 + callbackRate);
              // Trailing stop loss is activated
              if (lastCandle.high >= stopLossPrice) {
                let pnl = this.getPositionPNL(position, price);

                wallet.availableBalance += position.margin + pnl - fees;
                wallet.totalWalletBalance += pnl - fees;
                position.size += quantity;
                position.margin = Math.abs(position.size * price) / leverage;

                this.updateProfitLossStrategyProperty(pnl);

                this.strategyReport.totalFees += fees;
                if (price <= entryPrice)
                  this.strategyReport.shortWinningTrade++;
                else this.strategyReport.shortLostTrade++;

                this.addToHistoric(
                  date,
                  pair,
                  'BUY',
                  'TRAILING_STOP_MARKET',
                  'CLOSE',
                  size,
                  price,
                  pnl
                );

                log(
                  `Trailing stop long order #${id} has been activated for ${Math.abs(
                    quantity
                  )}${asset} at ${price}. Fees: ${fees}`,
                  chalk.magenta
                );
              }
            }
          }

          // If an order close the position, do not continue to check the other orders.
          // Prevent to have multiple orders touches at the same time
          if (position.size === 0) {
            this.closeOpenOrders(pair);
            return false;
          } else {
            return true;
          }
        });

      shortOrders
        .sort((order1, order2) => order1.price - order2.price) // sort orders from nearest price to furthest price
        .every(({ id, price, quantity, type, trailingStop }) => {
          const { entryPrice, size, leverage } = position;
          const fees = quantity * price * (MAKER_FEES / 100);

          // Price crossed the sell limit order
          if (
            (type === 'LIMIT' || type === 'STOP') &&
            lastCandle.high > price &&
            lastCandle.low < price
          ) {
            // Average the position
            if (position.positionSide === 'SHORT') {
              let baseCost = (price * quantity) / leverage;

              // If there is enough available base
              if (wallet.availableBalance >= baseCost + fees) {
                let avgEntryPrice =
                  (price * quantity + entryPrice * Math.abs(size)) /
                  (quantity + Math.abs(size));

                position.margin += baseCost;
                position.size -= quantity;
                position.entryPrice = avgEntryPrice;
                wallet.availableBalance -= baseCost + fees;
                wallet.totalWalletBalance -= fees;

                if (!hasPosition) {
                  this.strategyReport.totalTrades++;
                  this.strategyReport.totalShortTrades++;
                }
                this.strategyReport.totalFees += fees;

                this.addToHistoric(
                  date,
                  pair,
                  'SELL',
                  'LIMIT',
                  'OPEN',
                  size,
                  price,
                  null
                );

                log(
                  `Sell order #${id} has been activated for ${Math.abs(
                    quantity
                  )}${asset} at ${price}. Fees: ${fees}`,
                  chalk.magenta
                );
              }
            } else if (position.positionSide === 'LONG') {
              // Update wallet
              let pnl = this.getPositionPNL(position, price);
              wallet.availableBalance += position.margin + pnl - fees;
              wallet.totalWalletBalance += pnl - fees;

              // Update strategy report
              this.updateProfitLossStrategyProperty(pnl);

              // Update position
              position.size -= quantity;
              position.margin = Math.abs(position.size * price) / leverage;

              // The position has been closed
              if (position.size === 0) {
                position.entryPrice = 0;
                position.unrealizedProfit = 0;
              }

              // The position side has been changed
              if (position.size < 0) {
                position.entryPrice = price;
                position.positionSide = 'SHORT';
                let newPnl = this.getPositionPNL(position, price);
                position.unrealizedProfit = newPnl;
                wallet.availableBalance -= position.margin;
                this.strategyReport.totalTrades++;
                this.strategyReport.totalShortTrades++;
              }

              if (hasPosition && entryPrice <= price)
                this.strategyReport.longWinningTrade++;
              if (hasPosition && entryPrice > price)
                this.strategyReport.longLostTrade++;
              this.strategyReport.totalFees += fees;

              this.addToHistoric(
                date,
                pair,
                'SELL',
                type,
                'CLOSE',
                size,
                price,
                pnl
              );

              log(
                `${
                  entryPrice > price
                    ? '[SL]'
                    : entryPrice < price
                    ? '[TP]'
                    : '[BE]'
                } Sell order #${id} has been activated for ${quantity}${asset} at ${price}. Fees: ${fees}`,
                chalk.magenta
              );

              this.closeOpenOrder(id);
            }
          }

          // Trailing stops
          if (type === 'TRAILING_STOP_MARKET') {
            let activationPrice = price;
            let { status, callbackRate } = trailingStop;
            if (status === 'PENDING' && lastCandle.high >= activationPrice) {
              status = 'ACTIVE';
            }
            if (status === 'ACTIVE') {
              let stopLossPrice = lastCandle.open * (1 - callbackRate);
              // Trailing stop loss is activated
              if (lastCandle.low <= stopLossPrice) {
                let pnl = this.getPositionPNL(position, price);

                wallet.availableBalance += position.margin + pnl - fees;
                wallet.totalWalletBalance += pnl - fees;
                position.size += quantity;
                position.margin = Math.abs(position.size * price) / leverage;

                this.updateProfitLossStrategyProperty(pnl);

                this.strategyReport.totalFees += fees;
                if (price >= entryPrice) this.strategyReport.longWinningTrade++;
                else this.strategyReport.longLostTrade++;

                this.addToHistoric(
                  date,
                  pair,
                  'SELL',
                  'TRAILING_STOP_MARKET',
                  'CLOSE',
                  size,
                  price,
                  pnl
                );

                log(
                  `Trailing stop sell order #${id} has been activated for ${Math.abs(
                    quantity
                  )}${asset} at ${price}. Fees: ${fees}`,
                  chalk.magenta
                );
              }
            }
          }

          // If an order close the position, do not continue to check the other orders.
          // Prevent to have multiple orders touches at the same time
          if (position.size === 0) {
            this.closeOpenOrders(pair);
            return false;
          } else {
            return true;
          }
        });
    }
  }

  /**
   * Get the pnl of a position according to a price
   * @param position
   * @param currentPrice
   */
  private getPositionPNL(position: Position, currentPrice: number) {
    const entryPrice = position.entryPrice;
    const delta = (currentPrice - entryPrice) / entryPrice;

    if (position.size !== 0 && position.margin > 0 && position.entryPrice > 0) {
      if (position.positionSide === 'LONG') {
        return delta * position.margin * position.leverage;
      } else {
        return -delta * position.margin * position.leverage;
      }
    } else {
      return 0;
    }
  }

  /**
   * Update the pnl of the position object
   * @param asset
   * @param base
   * @param currentPrice
   */
  private updatePNL(asset: string, base: string, currentPrice: number) {
    let positions = this.wallet.positions;
    let indexAsset = positions.findIndex((pos) => pos.pair === asset + base);
    let position = positions[indexAsset];
    position.unrealizedProfit = this.getPositionPNL(position, currentPrice);
  }

  /**
   * Update the total unrealized profit property of the futures wallet object
   */
  private updateTotalPNL() {
    let totalPNL = 0;
    this.wallet.positions
      .filter(
        (position) =>
          position.size !== 0 && position.margin > 0 && position.entryPrice > 0
      )
      .forEach((position) => {
        totalPNL += position.unrealizedProfit;
      });
    this.wallet.totalUnrealizedProfit = totalPNL;
  }

  /**
   *  Close a  open order by its id
   * @param orderId The id of the order to close
   */
  private closeOpenOrder(orderId: string) {
    this.openOrders = this.openOrders.filter((order) => order.id !== orderId);
    log(`Close the open order #${orderId}`, chalk.cyan);
  }

  /**
   * Close all the open orders for a given pair
   * @param pair
   */
  private closeOpenOrders(pair: string) {
    this.openOrders = this.openOrders.filter((order) => order.pair !== pair);
    log(`Close all the open orders on the pair ${pair}`, chalk.cyan);
  }

  /**
   * Execute an order
   */
  private order({
    pair,
    price,
    quantity,
    side,
    type,
    trailingStopConfig,
  }: {
    pair: string;
    price: number;
    quantity: number;
    side: 'BUY' | 'SELL';
    type: 'MARKET' | 'LIMIT' | 'STOP' | 'TRAILING_STOP_MARKET';
    trailingStopConfig?: TrailingStopConfig;
  }) {
    const wallet = this.wallet;
    const positions = wallet.positions;
    const position = positions.find((pos) => pos.pair === pair);
    const { entryPrice, size, leverage } = position;
    const hasPosition = position.size !== 0;

    if (quantity < 0) {
      console.error(
        `Cannot execute the market order for ${pair}. The quantity is malformed: ${quantity}`
      );
      return;
    }

    if (type === 'MARKET') {
      const fees = price * quantity * (TAKER_FEES / 100);

      if (side === 'BUY') {
        if (position.positionSide === 'LONG') {
          let baseCost = (price * quantity) / leverage;
          // If there is enough available base currency
          if (wallet.availableBalance >= baseCost + fees) {
            let avgEntryPrice =
              (price * quantity + entryPrice * Math.abs(size)) /
              (quantity + Math.abs(size));

            position.margin += baseCost;
            position.size += quantity;
            position.entryPrice = avgEntryPrice;

            wallet.availableBalance -= baseCost + fees;
            wallet.totalWalletBalance -= fees;

            if (!hasPosition) {
              this.strategyReport.totalTrades++;
              this.strategyReport.totalLongTrades++;
            }
            this.strategyReport.totalFees += fees;

            log(
              `Take a long position on ${pair} with a size of ${quantity} at ${price}. Fees: ${fees}`,
              chalk.green
            );
          }
        } else if (position.positionSide === 'SHORT') {
          // Update wallet
          let pnl = this.getPositionPNL(position, price);
          wallet.availableBalance += position.margin + pnl - fees;
          wallet.totalWalletBalance += pnl - fees;

          this.updateProfitLossStrategyProperty(pnl);

          // Update position
          position.size += quantity;
          position.margin = Math.abs(position.size * price) / leverage;

          // The position has been closed
          if (position.size === 0) {
            position.entryPrice = 0;
            position.unrealizedProfit = 0;
          }

          // The order changes the position side of the current position
          if (position.size > 0) {
            position.entryPrice = price;
            position.positionSide = 'LONG';
            let newPnl = this.getPositionPNL(position, price);
            position.unrealizedProfit = newPnl;
            wallet.availableBalance -= position.margin;
            this.strategyReport.totalTrades++;
            this.strategyReport.totalLongTrades++;
          }

          if (hasPosition && entryPrice >= price)
            this.strategyReport.shortWinningTrade++;
          if (hasPosition && entryPrice < price)
            this.strategyReport.shortLostTrade++;
          this.strategyReport.totalFees += fees;

          log(
            `Take a long position on ${pair} with a size of ${quantity} at ${price}. Fees: ${fees}`,
            chalk.green
          );
        }
      } else if (side === 'SELL') {
        let baseCost = (price * quantity) / leverage;

        if (position.positionSide === 'SHORT') {
          // If there is enough available base currency
          if (wallet.availableBalance >= baseCost + fees) {
            let avgEntryPrice =
              (price * quantity + entryPrice * Math.abs(size)) /
              (quantity + Math.abs(size));

            position.margin += baseCost;
            position.size -= quantity;
            position.entryPrice = avgEntryPrice;

            wallet.availableBalance -= baseCost + fees;
            wallet.totalWalletBalance -= fees;

            if (!hasPosition) {
              this.strategyReport.totalTrades++;
              this.strategyReport.totalShortTrades++;
            }
            this.strategyReport.totalFees += fees;

            log(
              `Take a short position on ${pair} with a size of ${-quantity} at ${price}. Fees: ${fees}`,
              chalk.red
            );
          }
        } else if (position.positionSide === 'LONG') {
          // Update wallet
          let pnl = this.getPositionPNL(position, price);
          wallet.availableBalance += position.margin + pnl - fees;
          wallet.totalWalletBalance += pnl - fees;

          this.updateProfitLossStrategyProperty(pnl);

          // Update position
          position.size -= quantity;
          position.margin = Math.abs(position.size * price) / leverage;

          // The position has been closed
          if (position.size === 0) {
            position.entryPrice = 0;
            position.unrealizedProfit = 0;
          }

          // The order changes the position side of the current order
          if (position.size < 0) {
            position.entryPrice = price;
            position.positionSide = 'SHORT';
            let newPnl = this.getPositionPNL(position, price);
            position.unrealizedProfit = newPnl;
            wallet.availableBalance -= position.margin;
            this.strategyReport.totalTrades++;
            this.strategyReport.totalShortTrades++;
          }

          if (hasPosition && entryPrice <= price)
            this.strategyReport.longWinningTrade++;
          if (hasPosition && entryPrice > price)
            this.strategyReport.longLostTrade++;
          this.strategyReport.totalFees += fees;

          log(
            `Take a short position on ${pair} with a size of ${-quantity} at ${price}. Fees: ${fees}`,
            chalk.red
          );
        }
      }
    }

    if (type === 'LIMIT' || type === 'STOP') {
      let baseCost =
        Math.abs(price * quantity) / position.leverage - position.margin;
      let canOrder =
        position.size !== 0
          ? side === (position.positionSide === 'LONG' ? 'BUY' : 'SELL')
            ? this.wallet.availableBalance >= baseCost // Average the current position
            : true // Take profit or Stop Loss
          : this.wallet.availableBalance >= baseCost; // New position

      if (canOrder) {
        let order: OpenOrder = {
          id: Math.random().toString(16).slice(2),
          pair,
          type,
          side,
          price,
          quantity,
        };
        this.openOrders.push(order);
      } else {
        console.error(
          `Limit order for the pair ${pair} cannot be placed. quantity=${quantity} price=${price}`
        );
      }
    }

    if (type === 'TRAILING_STOP_MARKET' && trailingStopConfig) {
      let canOrder = quantity <= Math.abs(position.size);
      if (canOrder) {
        let order: OpenOrder = {
          id: Math.random().toString(16).slice(2),
          pair,
          type: 'TRAILING_STOP_MARKET',
          side,
          price, // activation price
          quantity,
          trailingStop: {
            status: 'PENDING',
            callbackRate: trailingStopConfig.callbackRate,
            activation: {
              changePercentage: trailingStopConfig.activation.changePercentage,
              percentageToTP: trailingStopConfig.activation.changePercentage,
            },
          },
        };
        this.openOrders.push(order);
      } else {
        console.error(
          `Trailing stop order for the pair ${pair} cannot be placed`
        );
      }
    }
  }
}
