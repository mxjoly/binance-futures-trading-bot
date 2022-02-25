import colors from 'ansi-colors';
import { CandleChartInterval, ExchangeInfo, OrderSide } from 'binance-api-node';
import chalk from 'chalk';
import cliProgress from 'cli-progress';
import csv from 'csv-parser';
import dayjs from 'dayjs';
import fs from 'fs';
import path from 'path';
import { binanceClient, BINANCE_MODE } from '..';
import { decimalCeil, decimalFloor } from '../utils/math';
import { clone } from '../utils';
import {
  getPricePrecision,
  getQuantityPrecision,
  isValidQuantity,
} from '../utils/rules';
import {
  compareTimeFrame,
  dateMatchTimeFrame,
  durationBetweenDates,
  timeFrameToMinutes,
} from '../utils/time';
import { createDatabase, saveFuturesState, saveState } from './db';
import { debugLastCandle, debugWallet, log, printDateBanner } from './debug';
import generateHTMLReport from './generateReport';

const BotConfig = require(`${process.cwd()}/config.json`);
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
const SAVE_HISTORY = BacktestConfig['save'];

// Debug mode with console.log
export const DEBUG = process.argv[2]
  ? process.argv[2].split('=')[1] === 'true'
    ? true
    : false
  : false;

// Max length of the candle arrays needed for the strategy and the calculation of indicators
// Better to have the minimum to get a higher performance
const MAX_LENGTH_CANDLES = 250;

// ====================================================================== //

// Exchange fee info
const TAKER_FEES =
  BINANCE_MODE === 'spot'
    ? BacktestConfig['taker_fees_spot']
    : BacktestConfig['taker_fees_futures']; // %
const MAKER_FEES =
  BINANCE_MODE === 'spot'
    ? BacktestConfig['maker_fees_spot']
    : BacktestConfig['maker_fees_futures']; // %

// ====================================================================== //

export class BackTestBot {
  // Configuration
  private tradeConfigs: TradeConfig[];
  private strategyName: string;

  // Candles
  private historicCandleDataMultiTimeFrames: {
    [symbol: string]: CandlesDataMultiTimeFrames;
  };

  // Initial parameters
  private startDate: Date;
  private endDate: Date;
  private initialCapital: number;

  // Account mocks
  private wallet: Wallet;
  private futuresWallet: FuturesWallet;
  private openOrders: OpenOrder[];
  private futuresOpenOrders: FuturesOpenOrder[];

  // For the strategy report
  private strategyReport: StrategyReport;
  private maxBalance: number;
  private maxDrawdown: number;
  private maxProfit: number;
  private maxLoss: number;
  private maxConsecutiveWins: number;
  private maxConsecutiveLosses: number;
  private maxConsecutiveProfitCount: number;
  private maxConsecutiveLossCount: number;

  // To generate the html report
  private chartLabels: string[];
  private chartData: number[];

  constructor(
    tradeConfigs: TradeConfig[],
    strategyName: string,
    startDate: Date,
    endDate: Date,
    initialCapital: number
  ) {
    this.tradeConfigs = tradeConfigs;
    this.strategyName = strategyName;
    this.startDate = startDate;
    this.endDate = endDate;
    this.initialCapital = initialCapital;

    this.historicCandleDataMultiTimeFrames = {};

    this.strategyReport = {};
    this.maxBalance = initialCapital;
    this.maxDrawdown = 1;
    this.maxProfit = 0;
    this.maxLoss = 0;
    this.maxConsecutiveWins = 0;
    this.maxConsecutiveLosses = 0;
    this.maxConsecutiveProfitCount = 0;
    this.maxConsecutiveLossCount = 0;

    this.chartLabels = [];
    this.chartData = [];
  }

  public prepare() {
    if (SAVE_HISTORY) createDatabase(this.strategyName);

    let numberAssetsInBalance = 0;

    if (BINANCE_MODE === 'spot') {
      this.wallet = { balances: [] };
      this.openOrders = [];
      const balance = this.wallet.balances;

      this.tradeConfigs.forEach(({ base, asset }) => {
        // Add base balance
        if (!balance.some((balance) => balance.symbol === base)) {
          balance.push({
            symbol: base,
            quantity: this.initialCapital,
            avgPrice: 1,
          });
        }
        // Add asset balance
        if (!balance.some((balance) => balance.symbol === asset)) {
          balance.push({
            symbol: asset,
            quantity: 0,
            avgPrice: 0,
          });
          numberAssetsInBalance++;
        }
      });
    } else {
      this.futuresWallet = {
        availableBalance: this.initialCapital,
        totalWalletBalance: this.initialCapital,
        totalUnrealizedProfit: 0,
        positions: this.tradeConfigs.map(({ asset, base, leverage }) => ({
          pair: asset + base,
          leverage,
          entryPrice: 0,
          margin: 0,
          positionSide: 'LONG',
          unrealizedProfit: 0,
          size: 0,
        })),
      };
      this.futuresOpenOrders = [];
    }

    // Initialize some property of strategy result
    this.strategyReport.initialCapital = this.initialCapital;
    this.strategyReport.numberSymbol =
      BINANCE_MODE === 'spot'
        ? numberAssetsInBalance
        : this.futuresWallet.positions.length;
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
    this.strategyReport.maxConsecutiveWins = 0;
    this.strategyReport.maxConsecutiveLosses = 0;
  }

  private async prepareCandleHistoric() {
    this.tradeConfigs.forEach(
      ({ asset, base, loopInterval, indicatorIntervals }) => {
        this.historicCandleDataMultiTimeFrames[asset + base] = {};
        new Set([loopInterval, ...indicatorIntervals]).forEach((interval) => {
          this.historicCandleDataMultiTimeFrames[asset + base][interval] = [];
        });
      }
    );

    // Load the candle data streams
    let loadPairTimeFrame = [];
    this.tradeConfigs.forEach(
      ({ asset, base, loopInterval, indicatorIntervals }) => {
        new Set([loopInterval, ...indicatorIntervals]).forEach((interval) => {
          loadPairTimeFrame.push(
            new Promise<void>((resolve, reject) => {
              this.loadCandles(asset + base, interval)
                .then((candles) => {
                  this.historicCandleDataMultiTimeFrames[asset + base][
                    interval
                  ] = candles;
                  resolve();
                })
                .catch(reject);
            })
          );
        });
      }
    );

    await Promise.all(loadPairTimeFrame);

    // Check if the candle data are available on the specified period
    let historyError = false;
    this.tradeConfigs.forEach(({ asset, base }) => {
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

    // Check the start date and end date comparing to the historic date period downloaded
    Object.keys(this.historicCandleDataMultiTimeFrames).forEach((pair) => {
      let candles = this.historicCandleDataMultiTimeFrames[pair];
      Object.keys(this.historicCandleDataMultiTimeFrames[pair]).forEach(
        (timeFrame) => {
          let candleTimeFrame = candles[timeFrame];
          let startDate = candleTimeFrame[0].openTime;
          let endDate = dayjs(
            candleTimeFrame[candleTimeFrame.length - 1].closeTime
          ).add(1, 'minute');
          if (dayjs(this.startDate).isBefore(startDate)) {
            console.warn(
              `Your start date is too old comparing to your downloaded candle data for ${pair} in ${timeFrame}. The earliest possible date is ${dayjs(
                startDate
              ).format('YYYY-MM-DD HH:mm:ss')}\n`
            );
          }
          if (dayjs(this.endDate).isAfter(endDate)) {
            console.warn(
              `Your start date is too recent comparing to your downloaded candle data for ${pair} in ${timeFrame}. The latest possible date is ${dayjs(
                endDate
              ).format('YYYY-MM-DD HH:mm:ss')}\n`
            );
          }
        }
      );
    });
  }

  public async run() {
    log(
      '====================== 💵 BINANCE TRADING BOT (BACKTEST) 💵 ======================'
    );

    // Get exchange info (account information are incomplete in the testnet)
    const exchangeInfo =
      BINANCE_MODE === 'spot' && process.env.NODE_ENV === 'production'
        ? await binanceClient.exchangeInfo()
        : await binanceClient.futuresExchangeInfo();

    // Prepare the candle historic
    await this.prepareCandleHistoric();

    // Get the smaller loop time frame in the trade configs
    const smallerTimeFrame = this.tradeConfigs
      .map(({ loopInterval }) => loopInterval)
      .sort((tf1, tf2) => compareTimeFrame(tf1, tf2))[0];

    // Duration of the backtest period in minutes
    const duration = durationBetweenDates(
      this.startDate,
      this.endDate,
      smallerTimeFrame
    );

    // Set property for strategy
    this.strategyReport.totalBars = duration;

    // Initiation of CLI Progress bar
    if (!DEBUG) bar.start(duration, 0);

    // Index to generated candle arrays progressively
    let indexes: {
      [pair: string]: { [timeFrame: string]: { start: number; end: number } };
    } = {};
    this.tradeConfigs.forEach(
      ({ asset, base, indicatorIntervals, loopInterval }) => {
        indexes[asset + base] = {};
        new Set([loopInterval, ...indicatorIntervals]).forEach((interval) => {
          indexes[asset + base][interval] = { start: 0, end: 0 };
        });
      }
    );

    // Time loop
    let currentDate = this.startDate;
    while (dayjs(currentDate).isSameOrBefore(this.endDate)) {
      printDateBanner(currentDate);

      this.tradeConfigs.forEach((config) => {
        const { base, asset, loopInterval, indicatorIntervals } = config;
        const pair = asset + base;

        // Update the candle data array on multiple time frame
        new Set([loopInterval, ...indicatorIntervals]).forEach((interval) => {
          let { indexStart, indexEnd } = this.updateCandleHistoricIndex(
            indexes[pair][interval].start,
            indexes[pair][interval].end,
            pair,
            interval,
            currentDate
          );
          indexes[pair][interval].start = indexStart;
          indexes[pair][interval].end = indexEnd;
        });

        let candles = this.generateCandleHistoric(pair, indexes[pair]);
        let candlesStream: CandleData[] = candles[pair][loopInterval];

        if (candlesStream.length > 0) {
          const currentCandle = candlesStream[candlesStream.length - 1];
          const currentPrice = currentCandle.close;

          debugLastCandle(currentCandle);

          // Check if an open order has been activated
          if (BINANCE_MODE === 'spot') {
            this.checkSpotOpenOrders(asset, base, candlesStream);
          } else {
            this.checkFuturesOpenOrders(asset, base, candlesStream);
            this.updatePNL(asset, base, currentPrice);
          }

          if (dateMatchTimeFrame(currentDate, config.loopInterval)) {
            if (BINANCE_MODE === 'spot') {
              this.tradeWithSpot(
                config,
                currentPrice,
                candles[pair],
                exchangeInfo
              );
            } else {
              this.tradeWithFutures(
                config,
                currentPrice,
                candles[pair],
                exchangeInfo
              );
              this.updatePNL(asset, base, currentPrice);
            }
          }
        }
      });

      this.saveStateToDB(currentDate);
      this.updateMaxDrawdownMaxBalance();

      debugWallet(this.wallet, this.futuresWallet);
      log(''); // \n

      if (!DEBUG)
        bar.increment(1, {
          date: dayjs(currentDate).format('YYYY-MM-DD HH:mm'),
        });

      // Preparing chart data
      this.chartLabels.push(dayjs(currentDate).format('YYYY-MM-DD'));
      this.chartData.push(
        BINANCE_MODE === 'spot'
          ? this.evaluateSpotWalletBaseValue()
          : this.futuresWallet.totalWalletBalance
      );

      currentDate = dayjs(currentDate)
        .add(timeFrameToMinutes(smallerTimeFrame), 'minute')
        .toDate();
    }

    if (!DEBUG) bar.stop();

    // Strategy results
    this.calculateStrategyStats();
    this.displayStrategyResults();
    generateHTMLReport(
      this.strategyName,
      this.strategyReport,
      this.chartLabels,
      this.chartData
    );
  }

  private generateCandleHistoric(
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

  private updateCandleHistoricIndex(
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
      if (dayjs(pairCandles[i].closeTime).isAfter(currentDate) && i > 0) {
        indexEnd = i - 1;
        break;
      }
      if (i - indexStart > MAX_LENGTH_CANDLES) indexStart++;
    }
    return { indexStart, indexEnd };
  }

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
      BINANCE_MODE === 'spot'
        ? this.evaluateSpotWalletBaseValue()
        : this.futuresWallet.totalWalletBalance,
      2
    );
    this.strategyReport.totalNetProfit = decimalFloor(
      BINANCE_MODE === 'spot'
        ? this.evaluateSpotWalletBaseValue() - this.initialCapital
        : this.futuresWallet.totalWalletBalance - this.initialCapital,
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
    this.strategyReport.profitFactor = Math.abs(
      decimalFloor(
        BINANCE_MODE === 'spot'
          ? this.evaluateSpotWalletBaseValue() / this.initialCapital
          : this.futuresWallet.totalWalletBalance / this.initialCapital,
        2
      )
    );
    this.strategyReport.maxDrawdown = -decimalFloor(
      (1 - this.maxDrawdown) * 100,
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
    this.strategyReport.maxConsecutiveWins = this.maxConsecutiveWins;
    this.strategyReport.maxConsecutiveLosses = this.maxConsecutiveLosses;
    this.strategyReport.maxConsecutiveProfit = decimalFloor(
      this.maxConsecutiveProfitCount,
      2
    );
    this.strategyReport.maxConsecutiveLoss = -decimalFloor(
      this.maxConsecutiveLossCount,
      2
    );
  }

  private displayStrategyResults() {
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
      maxDrawdown,
      maxConsecutiveProfit,
      maxConsecutiveLoss,
      maxConsecutiveWins,
      maxConsecutiveLosses,
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
    Max drawdown: ${maxDrawdown}%
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
    Max consecutive wins (count): ${maxConsecutiveWins}
    Max consecutive losses (count): ${maxConsecutiveLosses}
    `;
    console.log(strategyReportString);
  }

  private updateMaxDrawdownMaxBalance() {
    if (BINANCE_MODE === 'spot') {
      let currentWalletValue = this.evaluateSpotWalletBaseValue();
      if (currentWalletValue > this.maxBalance) {
        this.maxBalance = currentWalletValue;
      }
      let drawdown = currentWalletValue / this.maxBalance;
      if (drawdown < this.maxDrawdown) {
        this.maxDrawdown = drawdown;
      }
    } else {
      if (this.futuresWallet.totalWalletBalance > this.maxBalance) {
        this.maxBalance = this.futuresWallet.totalWalletBalance;
      }
      let drawdown = this.futuresWallet.totalWalletBalance / this.maxBalance;
      if (drawdown < this.maxDrawdown) {
        this.maxDrawdown = drawdown;
      }
    }
  }

  private updateProfitLossStrategyProperty(pnl: number) {
    if (pnl > 0) {
      this.strategyReport.totalProfit += pnl;
      this.strategyReport.maxConsecutiveWins++;
      this.strategyReport.maxConsecutiveProfit += Math.abs(pnl);
      if (this.strategyReport.maxConsecutiveLosses > this.maxConsecutiveLosses)
        this.maxConsecutiveLosses = this.strategyReport.maxConsecutiveLosses;
      if (this.strategyReport.maxConsecutiveLoss > this.maxConsecutiveLossCount)
        this.maxConsecutiveLossCount = this.strategyReport.maxConsecutiveLoss;
      this.strategyReport.maxConsecutiveLosses = 0;
      this.strategyReport.maxConsecutiveLoss = 0;
      if (Math.abs(pnl) > this.maxProfit) this.maxProfit = Math.abs(pnl);
    }
    if (pnl < 0) {
      this.strategyReport.totalLoss += pnl;
      this.strategyReport.maxConsecutiveLosses++;
      this.strategyReport.maxConsecutiveLoss += Math.abs(pnl);
      if (this.strategyReport.maxConsecutiveWins > this.maxConsecutiveWins)
        this.maxConsecutiveWins = this.strategyReport.maxConsecutiveWins;
      if (
        this.strategyReport.maxConsecutiveProfit >
        this.maxConsecutiveProfitCount
      )
        this.maxConsecutiveProfitCount =
          this.strategyReport.maxConsecutiveProfit;
      this.strategyReport.maxConsecutiveWins = 0;
      this.strategyReport.maxConsecutiveProfit = 0;
      if (Math.abs(pnl) > this.maxLoss) this.maxLoss = Math.abs(pnl);
    }
  }

  private saveStateToDB(currentDate: Date) {
    if (BINANCE_MODE === 'spot') {
      if (SAVE_HISTORY) {
        saveState(
          dayjs(currentDate).format('YYYY-MM-DD HH:mm'),
          clone(this.wallet),
          clone(this.openOrders)
        );
      }
    } else {
      this.updateTotalPNL();
      if (SAVE_HISTORY) {
        saveFuturesState(
          dayjs(currentDate).format('YYYY-MM-DD HH:mm'),
          clone(this.futuresWallet),
          clone(this.futuresOpenOrders)
        );
      }
    }
  }

  private tradeWithSpot(
    tradeConfig: TradeConfig,
    currentPrice: number,
    candles: CandlesDataMultiTimeFrames,
    exchangeInfo: ExchangeInfo
  ) {
    const {
      asset,
      base,
      risk,
      buyStrategy,
      sellStrategy,
      exitStrategy,
      riskManagement,
      allowPyramiding,
      maxPyramidingAllocation,
    } = tradeConfig;
    const pair = asset + base;

    // Balance information
    const balances = this.wallet.balances;
    const indexBase = balances.findIndex((bal) => bal.symbol === base);
    const indexAsset = balances.findIndex((bal) => bal.symbol === asset);
    const assetBalance = balances[indexAsset].quantity;
    const baseBalance = balances[indexBase].quantity;

    // Open orders
    const currentOpenOrders = this.openOrders.filter(
      (order) => order.pair === pair
    );

    // Conditions
    const canBuy =
      !allowPyramiding ||
      (allowPyramiding &&
        assetBalance * currentPrice <= baseBalance * maxPyramidingAllocation);

    // Precisions
    const pricePrecision = getPricePrecision(pair, exchangeInfo);
    const quantityPrecision = getQuantityPrecision(pair, exchangeInfo);

    // Prevent remaining open orders
    if (assetBalance === 0 && currentOpenOrders.length > 0)
      this.closeOpenOrders(pair);

    if (assetBalance > 0 && sellStrategy(candles)) {
      this.spotOrderMarket(asset, base, currentPrice, assetBalance, 'SELL');
      this.closeOpenOrders(pair);
    }
    if (canBuy && buyStrategy(candles)) {
      const quantity = riskManagement({
        asset,
        base,
        balance: baseBalance,
        risk,
        enterPrice: currentPrice,
        exchangeInfo,
      });

      // Buy market order
      this.spotOrderMarket(asset, base, currentPrice, quantity, 'BUY');

      // Calculate the tp and sl
      const { takeProfits, stopLoss } = exitStrategy
        ? exitStrategy(currentPrice, candles, pricePrecision, OrderSide.BUY)
        : { takeProfits: [], stopLoss: null };

      // Remove the current open orders to update them
      if (currentOpenOrders.length > 0) this.closeOpenOrders(pair);

      if (takeProfits.length > 0) {
        // Create all the take profit targets
        takeProfits.forEach(({ price, quantityPercentage }) => {
          // Sell limit order as TP
          this.spotOrderLimit(
            asset,
            base,
            price,
            decimalFloor(quantity * quantityPercentage, quantityPrecision),
            'SELL'
          );
        });
      }

      if (stopLoss) {
        // Sell limit order as SL
        this.spotOrderLimit(asset, base, stopLoss, quantity, 'SELL');
      }
    }
  }

  private tradeWithFutures(
    tradeConfig: TradeConfig,
    currentPrice: number,
    candles: CandlesDataMultiTimeFrames,
    exchangeInfo: ExchangeInfo
  ) {
    const {
      asset,
      base,
      risk,
      buyStrategy,
      sellStrategy,
      exitStrategy,
      trendFilter,
      riskManagement,
      trailingStopConfig,
      allowPyramiding,
      maxPyramidingAllocation,
      unidirectional,
    } = tradeConfig;
    const pair = asset + base;

    const useLongPosition = trendFilter ? trendFilter(candles) === 1 : true;
    const useShortPosition = trendFilter ? trendFilter(candles) === -1 : true;

    // Balance information
    const assetBalance = this.futuresWallet.totalWalletBalance;
    const availableBalance = this.futuresWallet.availableBalance;

    // Position information
    const positions = this.futuresWallet.positions;
    const position = positions.find((position) => position.pair === pair);
    const hasLongPosition = position.size > 0;
    const hasShortPosition = position.size < 0;

    // Conditions to take or not a position
    const canAddToPosition = allowPyramiding
      ? position.margin + assetBalance * risk <=
        assetBalance * maxPyramidingAllocation
      : false;
    const canTakeLongPosition =
      (!allowPyramiding && !hasLongPosition) || allowPyramiding;
    const canTakeShortPosition =
      (!allowPyramiding && !hasShortPosition) || allowPyramiding;

    // Open orders
    const currentOpenOrders = this.futuresOpenOrders.filter(
      (order) => order.pair === pair
    );

    // Precisions
    const pricePrecision = getPricePrecision(pair, exchangeInfo);
    const quantityPrecision = getQuantityPrecision(pair, exchangeInfo);

    // Prevent remaining open orders when all the take profit or a stop loss has been filled
    if (!hasLongPosition && !hasShortPosition && currentOpenOrders.length > 0) {
      this.closeFuturesOpenOrders(pair);
    }

    if (canTakeLongPosition && buyStrategy(candles)) {
      // Take the profit and not open a new position
      if (hasShortPosition && unidirectional) {
        this.futuresOrderMarket(
          pair,
          currentPrice,
          Math.abs(position.size),
          'BUY'
        );
        this.closeFuturesOpenOrders(pair);
        return;
      }

      // Do not trade with long position if the trend is down
      if (!useLongPosition) return;

      // Do not add to the current position if the allocation is over the max allocation
      if (allowPyramiding && hasLongPosition && !canAddToPosition) return;

      // Do not close the current short position built progressively in pyramiding mode
      if (allowPyramiding && hasShortPosition) return;

      // Calculate TP and SL
      let { takeProfits, stopLoss } =
        !allowPyramiding && exitStrategy
          ? exitStrategy(currentPrice, candles, pricePrecision, OrderSide.BUY)
          : { takeProfits: [], stopLoss: null };

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

      this.futuresOrderMarket(pair, currentPrice, quantity, 'BUY');

      // Cancel the previous orders to update them
      if (currentOpenOrders.length > 0) {
        this.closeFuturesOpenOrders(pair);
      }

      // In pyramiding mode, update the take profits and stop loss
      if (allowPyramiding && hasLongPosition) {
        let { takeProfits: updatedTakeProfits, stopLoss: updatedStopLoss } =
          exitStrategy
            ? exitStrategy(
                position.entryPrice,
                candles,
                pricePrecision,
                OrderSide.BUY
              )
            : { takeProfits: [], stopLoss: null };
        takeProfits = updatedTakeProfits;
        stopLoss = updatedStopLoss;
      }

      if (takeProfits.length > 0) {
        // Create the take profit orders
        takeProfits.forEach(({ price, quantityPercentage }) => {
          // Take profit order
          this.futuresOrderLimit(
            pair,
            price,
            Math.abs(position.size) * quantityPercentage,
            'SHORT'
          );
        });
      }

      if (stopLoss) {
        // Stop loss order
        this.futuresOrderLimit(
          pair,
          stopLoss,
          Math.abs(position.size),
          'SHORT'
        );
      }

      if (trailingStopConfig) {
        const calculateActivationPrice = (currentPrice: number) => {
          let { percentageToTP, changePercentage } =
            trailingStopConfig.activation;

          if (takeProfits.length > 0 && percentageToTP) {
            const nearestTakeProfitPrice = Math.min(
              ...takeProfits.map((tp) => tp.price)
            );
            let delta = Math.abs(nearestTakeProfitPrice - currentPrice);
            return decimalFloor(
              currentPrice + delta * percentageToTP,
              pricePrecision
            );
          } else if (changePercentage) {
            return decimalFloor(
              currentPrice * (1 + changePercentage),
              pricePrecision
            );
          } else {
            return currentPrice;
          }
        };

        this.futuresOrderTrailingStop(
          asset,
          base,
          calculateActivationPrice(position.entryPrice),
          Math.abs(position.size),
          'SHORT',
          trailingStopConfig.callbackRate,
          trailingStopConfig.activation
        );
      }
    } else if (canTakeShortPosition && sellStrategy(candles)) {
      // Take the profit and not open a new position
      if (hasLongPosition && unidirectional) {
        this.futuresOrderMarket(
          pair,
          currentPrice,
          Math.abs(position.size),
          'SELL'
        );
        this.closeFuturesOpenOrders(pair);
        return;
      }

      // Do not trade with short position if the trend is up
      if (!useShortPosition) return;

      // Do not add to the current position if the allocation is over the max allocation
      if (allowPyramiding && hasShortPosition && !canAddToPosition) return;

      // Do not close the current long position built progressively in pyramiding mode
      if (allowPyramiding && hasLongPosition) return;

      // Do not sell if a take profit is set on the last long positions
      let hasTakeProfits = currentOpenOrders.some(
        (order) => order.price > position.entryPrice
      );
      if (hasLongPosition && hasTakeProfits) return;

      // Calculate TP and SL
      let { takeProfits, stopLoss } = exitStrategy
        ? exitStrategy(currentPrice, candles, pricePrecision, OrderSide.SELL)
        : { takeProfits: [], stopLoss: null };

      // Risk Management
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

      this.futuresOrderMarket(pair, currentPrice, quantity, 'SELL');

      // Cancel the previous orders to update them
      if (currentOpenOrders.length > 0) {
        this.closeFuturesOpenOrders(pair);
      }

      // In pyramiding mode, update the take profits and stop loss
      if (allowPyramiding && hasLongPosition) {
        let { takeProfits: updatedTakeProfits, stopLoss: updatedStopLoss } =
          exitStrategy
            ? exitStrategy(
                position.entryPrice,
                candles,
                pricePrecision,
                OrderSide.BUY
              )
            : { takeProfits: [], stopLoss: null };
        takeProfits = updatedTakeProfits;
        stopLoss = updatedStopLoss;
      }

      if (takeProfits.length > 0) {
        // Create the take profit orders
        takeProfits.forEach(({ price, quantityPercentage }) => {
          // Take profit order
          this.futuresOrderLimit(
            pair,
            price,
            Math.abs(position.size) * quantityPercentage,
            'LONG'
          );
        });
      }

      if (stopLoss) {
        // Stop loss order
        this.futuresOrderLimit(pair, stopLoss, Math.abs(position.size), 'LONG');
      }

      if (trailingStopConfig) {
        const calculateActivationPrice = (currentPrice: number) => {
          let { percentageToTP, changePercentage } =
            trailingStopConfig.activation;

          if (takeProfits.length > 0 && percentageToTP) {
            const nearestTakeProfitPrice = Math.max(
              ...takeProfits.map((tp) => tp.price)
            );
            let delta = Math.abs(currentPrice - nearestTakeProfitPrice);
            return decimalCeil(
              currentPrice - delta * percentageToTP,
              pricePrecision
            );
          } else if (changePercentage) {
            return decimalCeil(
              currentPrice * (1 - changePercentage),
              pricePrecision
            );
          } else {
            return currentPrice;
          }
        };

        this.futuresOrderTrailingStop(
          asset,
          base,
          calculateActivationPrice(position.entryPrice),
          Math.abs(position.size),
          'LONG',
          trailingStopConfig.callbackRate,
          trailingStopConfig.activation
        );
      }
    }
  }

  private loadCandles(
    symbol: string,
    interval: CandleChartInterval,
    onlyFinalCandle = true
  ) {
    return new Promise<CandleData[]>((resolve, reject) => {
      let file = path.join(process.cwd(), 'data', symbol, `_${interval}.csv`);
      let candleData: CandleData[] = [];
      let results: CandleData[] = [];

      fs.createReadStream(file)
        .pipe(csv({ separator: ',' }))
        .on('data', (data: CandleData) => {
          candleData.push({
            openTime: new Date(data.openTime),
            closeTime: new Date(data.closeTime),
            open: Number(data.open),
            close: Number(data.close),
            high: Number(data.high),
            low: Number(data.low),
            volume: Number(data.volume),
          });
        })
        .on('end', () => {
          candleData = candleData.reverse();

          for (let i = 0; i < candleData.length; i++) {
            if (
              (onlyFinalCandle &&
                dayjs(candleData[i].openTime).isBetween(
                  this.startDate,
                  this.endDate,
                  'second',
                  '[]'
                ) &&
                dayjs(candleData[i].closeTime).isBetween(
                  this.startDate,
                  this.endDate,
                  'second',
                  '[]'
                )) ||
              (!onlyFinalCandle &&
                dayjs(candleData[i].openTime).isBetween(
                  this.startDate,
                  this.endDate,
                  'second',
                  '[]'
                ))
            ) {
              results.push({
                open: candleData[i].open,
                close: candleData[i].close,
                high: candleData[i].high,
                low: candleData[i].low,
                volume: candleData[i].volume,
                openTime: candleData[i].openTime,
                closeTime: candleData[i].closeTime,
              });
            }
          }
          resolve(results);
        });
    });
  }

  private checkSpotOpenOrders(
    asset: string,
    base: string,
    candles: CandleData[]
  ) {
    const lastCandle = candles[candles.length - 1];

    if (this.openOrders.length > 0) {
      const pair = asset + base;
      const pairOrders = this.openOrders.filter((order) => order.pair === pair);
      const buyOrders = pairOrders.filter((order) => order.side === 'BUY');
      const sellOrders = pairOrders.filter((order) => order.side === 'SELL');
      const balance = this.wallet.balances;
      const baseBalance = balance.find((bal) => bal.symbol === base);
      const assetBalance = balance.find((bal) => bal.symbol === asset);

      // Check if a buy order has been activated on the last candle
      buyOrders.forEach(({ id, price, quantity }) => {
        // Price crossed the buy limit order
        if (lastCandle.high > price && lastCandle.low < price) {
          let fees = quantity * price * (MAKER_FEES / 100);
          let baseCost = quantity * price;

          // If have enough base to buy asset including fees
          if (baseBalance.quantity >= baseCost + fees) {
            // Convert base to asset with fees
            baseBalance.quantity -= baseCost + fees;
            assetBalance.avgPrice =
              (assetBalance.avgPrice * assetBalance.quantity +
                quantity * price) /
              (assetBalance.quantity + quantity);
            assetBalance.quantity += quantity;

            this.strategyReport.totalTrades++;
            this.strategyReport.totalFees += fees;

            log(
              `Buy order #${id} has been activated for ${quantity}${asset} at ${price}. Fees: ${fees}`,
              chalk.magenta
            );
            // Close the order
            this.closeOpenOrder(id);
          }
        }
      });

      // Check if a sell order has been activated on the last candle
      sellOrders.forEach(({ id, price, quantity }) => {
        // Price crossed the sell limit order
        if (lastCandle.high > price && lastCandle.low < price) {
          // If have enough asset quantity to sell
          if (assetBalance.quantity >= quantity) {
            let fees = quantity * price * (MAKER_FEES / 100);
            let brutBaseReturn = quantity * price;
            let netBaseReturn =
              quantity * price - quantity * assetBalance.avgPrice;

            // Convert asset to base with fees
            assetBalance.quantity -= quantity;
            baseBalance.quantity += brutBaseReturn - fees;

            if (price >= assetBalance.avgPrice)
              this.strategyReport.totalProfit += netBaseReturn - fees;
            if (price < assetBalance.avgPrice)
              this.strategyReport.totalLoss += netBaseReturn - fees;

            this.updateProfitLossStrategyProperty(netBaseReturn);
            if (assetBalance.quantity === 0) assetBalance.avgPrice = 0;
            this.strategyReport.totalFees += fees;

            if (assetBalance.quantity === 0) this.closeOpenOrders(pair);

            log(
              `Sell order #${id} has been activated for ${quantity}${asset} at ${price}. Fees: ${fees}`,
              chalk.magenta
            );
            // Close the order
            this.closeOpenOrder(id);
          }
        }
      });
    }
  }

  private checkFuturesOpenOrders(
    asset: string,
    base: string,
    candles: CandleData[]
  ) {
    const lastCandle = candles[candles.length - 1];

    if (this.futuresOpenOrders.length > 0) {
      const pair = asset + base;
      const pairOrders = this.futuresOpenOrders.filter(
        (order) => order.pair === pair
      );
      const longOrders = pairOrders.filter(
        (order) => order.positionSide === 'LONG'
      );
      const shortOrders = pairOrders.filter(
        (order) => order.positionSide === 'SHORT'
      );
      const position = this.futuresWallet.positions.find(
        (position) => position.pair === pair
      );
      const wallet = this.futuresWallet;

      // Prevent remaining open orders when all the take profit or a stop loss has been filled
      if (position.size === 0 && this.futuresOpenOrders.length > 0) {
        this.closeFuturesOpenOrders(pair);
      }

      // Check if a long order has been activated on the last candle
      longOrders
        .sort((order1, order2) => order2.price - order1.price) // sort order from nearest to furthest
        .every(({ id, price, quantity, type, trailingStop }) => {
          let { entryPrice, size, leverage } = position;

          // Price crossed the buy limit order
          if (
            type !== 'TRAILING_STOP_MARKET' &&
            lastCandle.high > price &&
            lastCandle.low < price
          ) {
            if (type === 'LIMIT') {
              // Average the position
              if (position.positionSide === 'LONG') {
                let fees = quantity * price * (MAKER_FEES / 100);
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

                  this.strategyReport.totalTrades++;
                  this.strategyReport.totalLongTrades++;
                  this.strategyReport.totalFees += fees;

                  log(
                    `Long order #${id} has been activated for ${quantity}${asset} at ${price}. Fees: ${fees}`,
                    chalk.magenta
                  );
                }
              } else if (position.positionSide === 'SHORT') {
                let hadPosition = position.size < 0;

                // Fees
                let fees = quantity * price * (MAKER_FEES / 100);

                // Update wallet
                let pnl = this.getPositionPNL(position, price);
                wallet.availableBalance += position.margin + pnl - fees;
                wallet.totalWalletBalance += pnl - fees;

                // Update strategy report
                this.updateProfitLossStrategyProperty(pnl);

                // Update position
                position.size += quantity;
                position.margin = Math.abs(position.size * price) / leverage;

                if (position.size === 0) {
                  position.entryPrice = 0;
                  position.unrealizedProfit = 0;
                }

                if (position.size > 0) {
                  position.entryPrice = price;
                  position.positionSide = 'LONG';
                  let newPnl = this.getPositionPNL(position, price);
                  position.unrealizedProfit = newPnl;
                  wallet.availableBalance -= position.margin;
                  this.strategyReport.totalTrades++;
                  this.strategyReport.totalLongTrades++;
                }

                this.strategyReport.totalFees += fees;
                if (hadPosition && entryPrice >= price)
                  this.strategyReport.shortWinningTrade++;
                if (hadPosition && entryPrice < price)
                  this.strategyReport.shortLostTrade++;

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

              this.closeFutureOpenOrder(id);
            }
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
                let fees = quantity * price * (MAKER_FEES / 100);

                wallet.availableBalance += position.margin + pnl - fees;
                wallet.totalWalletBalance += pnl - fees;
                position.size += quantity;
                position.margin = Math.abs(position.size * price) / leverage;

                this.updateProfitLossStrategyProperty(pnl);
                this.strategyReport.totalFees += fees;
                if (price <= entryPrice)
                  this.strategyReport.shortWinningTrade++;
                else this.strategyReport.shortLostTrade++;

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
            this.closeFuturesOpenOrders(pair);
            return false;
          } else {
            return true;
          }
        });

      shortOrders
        .sort((order1, order2) => order1.price - order2.price) // sort order from nearest to furthest
        .every(({ id, price, quantity, type, trailingStop }) => {
          let { entryPrice, size, leverage } = position;

          // Price crossed the sell limit order
          if (
            type !== 'TRAILING_STOP_MARKET' &&
            lastCandle.high > price &&
            lastCandle.low < price
          ) {
            // If there is enough available base
            if (type === 'LIMIT') {
              // Average the position
              if (position.positionSide === 'SHORT') {
                let fees = quantity * price * (MAKER_FEES / 100);
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

                  this.strategyReport.totalTrades++;
                  this.strategyReport.totalShortTrades++;
                  this.strategyReport.totalFees += fees;

                  log(
                    `Sell order #${id} has been activated for ${Math.abs(
                      quantity
                    )}${asset} at ${price}. Fees: ${fees}`,
                    chalk.magenta
                  );
                }
              } else if (position.positionSide === 'LONG') {
                let hadPosition = position.size > 0;

                // Fees
                let fees = quantity * price * (MAKER_FEES / 100);

                // Update wallet
                let pnl = this.getPositionPNL(position, price);
                wallet.availableBalance += position.margin + pnl - fees;
                wallet.totalWalletBalance += pnl - fees;

                // Update strategy report
                this.updateProfitLossStrategyProperty(pnl);

                // Update position
                position.size -= quantity;
                position.margin = Math.abs(position.size * price) / leverage;

                if (position.size === 0) {
                  position.entryPrice = 0;
                  position.unrealizedProfit = 0;
                }

                if (position.size < 0) {
                  position.entryPrice = price;
                  position.positionSide = 'SHORT';
                  let newPnl = this.getPositionPNL(position, price);
                  position.unrealizedProfit = newPnl;
                  wallet.availableBalance -= position.margin;
                  this.strategyReport.totalTrades++;
                  this.strategyReport.totalShortTrades++;
                }

                this.strategyReport.totalFees += fees;
                if (hadPosition && entryPrice <= price)
                  this.strategyReport.longWinningTrade++;
                if (hadPosition && entryPrice > price)
                  this.strategyReport.longLostTrade++;

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
              }

              this.closeFutureOpenOrder(id);
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
                let fees = quantity * price * (MAKER_FEES / 100);

                wallet.availableBalance += position.margin + pnl - fees;
                wallet.totalWalletBalance += pnl - fees;
                position.size += quantity;
                position.margin = Math.abs(position.size * price) / leverage;

                this.updateProfitLossStrategyProperty(pnl);
                this.strategyReport.totalFees += fees;
                if (price >= entryPrice) this.strategyReport.longWinningTrade++;
                else this.strategyReport.longLostTrade++;

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
            this.closeFuturesOpenOrders(pair);
            return false;
          } else {
            return true;
          }
        });
    }
  }

  private evaluateSpotWalletBaseValue() {
    return this.wallet.balances.reduce(
      (prev, cur) => prev + cur.avgPrice * cur.quantity,
      0
    );
  }

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

  private updatePNL(asset: string, base: string, currentPrice: number) {
    let positions = this.futuresWallet.positions;
    let indexAsset = positions.findIndex((pos) => pos.pair === asset + base);
    let position = positions[indexAsset];
    position.unrealizedProfit = this.getPositionPNL(position, currentPrice);
  }

  private updateTotalPNL() {
    let totalPNL = 0;
    this.futuresWallet.positions
      .filter(
        (position) =>
          position.size !== 0 && position.margin > 0 && position.entryPrice > 0
      )
      .forEach((position) => {
        totalPNL += position.unrealizedProfit;
      });
    this.futuresWallet.totalUnrealizedProfit = totalPNL;
  }

  private closeOpenOrder(orderId: string) {
    this.openOrders = this.openOrders.filter((order) => order.id !== orderId);
    log(`Close the open order #${orderId}`, chalk.cyan);
  }

  private closeFutureOpenOrder(orderId: string) {
    this.futuresOpenOrders = this.futuresOpenOrders.filter(
      (order) => order.id !== orderId
    );
    log(`Close the open order #${orderId}`, chalk.cyan);
  }

  private closeOpenOrders(pair: string) {
    this.openOrders = this.openOrders.filter((order) => order.pair !== pair);
    log(`Close all the open orders on the pair ${pair}`, chalk.cyan);
  }

  private closeFuturesOpenOrders(pair: string) {
    this.futuresOpenOrders = this.futuresOpenOrders.filter(
      (order) => order.pair !== pair
    );
    log(`Close all the open orders on the pair ${pair}`, chalk.cyan);
  }

  private spotOrderMarket(
    asset: string,
    base: string,
    price: number,
    quantity: number,
    side: 'BUY' | 'SELL'
  ) {
    const balance = this.wallet.balances;
    const baseBalance = balance.find((bal) => bal.symbol === base);
    const assetBalance = balance.find((bal) => bal.symbol === asset);
    const fees = quantity * price * (TAKER_FEES / 100);

    if (side === 'BUY') {
      let baseCost = quantity * price;

      // If have enough base to buy asset including fees
      if (baseBalance.quantity >= baseCost + fees) {
        // Convert base to asset with fees
        baseBalance.quantity -= baseCost + fees;
        assetBalance.avgPrice =
          (assetBalance.avgPrice * assetBalance.quantity + price * quantity) /
          (assetBalance.quantity + quantity);
        assetBalance.quantity += quantity;

        this.strategyReport.totalFees += fees;
        this.strategyReport.totalTrades++;

        log(
          `Buy ${quantity}${asset} at ${price} for ${baseCost}. Fees: ${fees}`,
          chalk.green
        );
      } else {
        log(
          `Not enough ${base} to buy ${asset}. Want to buy ${quantity}${asset} at ${price} with only ${baseBalance.quantity}${base}`,
          chalk.red
        );
      }
    }

    if (side === 'SELL') {
      // If have enough asset quantity to sell
      if (assetBalance.quantity >= quantity) {
        let brutBaseReturn = quantity * price;
        let netBaseReturn = quantity * price - quantity * assetBalance.avgPrice;

        // Convert asset to base including fees
        assetBalance.quantity -= quantity;
        baseBalance.quantity += brutBaseReturn - fees;

        if (price >= assetBalance.avgPrice)
          this.strategyReport.totalProfit += netBaseReturn - fees;
        if (price < assetBalance.avgPrice)
          this.strategyReport.totalLoss += netBaseReturn - fees;

        this.updateProfitLossStrategyProperty(netBaseReturn);
        this.strategyReport.totalFees += fees;
        if (assetBalance.quantity === 0) assetBalance.avgPrice = 0;

        log(
          `Sell ${quantity}${asset} at ${price} for ${brutBaseReturn}. Fees: ${fees}`,
          chalk.red
        );
      } else {
        log(
          `Not enough ${base} to buy ${asset}. Want to buy ${quantity}${asset} at ${price} with only ${baseBalance.quantity}${base}`,
          chalk.red
        );
      }
    }
  }

  private spotOrderLimit(
    asset: string,
    base: string,
    price: number,
    quantity: number,
    side: 'BUY' | 'SELL'
  ) {
    const balance = this.wallet.balances;
    const indexBase = balance.findIndex((bal) => bal.symbol === base);
    const indexAsset = balance.findIndex((bal) => bal.symbol === asset);
    let fees = quantity * price * (TAKER_FEES / 100);

    let canOrder =
      side === 'BUY'
        ? balance[indexBase].quantity >= quantity * price
        : balance[indexAsset].quantity >= quantity - fees; // quantity is lower than at buy order due to the fees
    if (canOrder) {
      let order: OpenOrder = {
        id: Math.random().toString(16).slice(2),
        pair: asset + base,
        type: 'LIMIT',
        side,
        price,
        quantity,
      };
      this.openOrders.push(order);
      log(
        `Create a ${side.toLowerCase()} limit order #${
          order.id
        } for ${quantity}${asset} at ${price}`,
        chalk.magenta
      );
    } else {
      console.error(
        `Limit order for the pair ${
          asset + base
        } cannot be placed. quantity=${quantity} price=${price}`
      );
    }
  }

  private futuresOrderMarket(
    pair: string,
    price: number,
    quantity: number,
    side: 'BUY' | 'SELL'
  ) {
    const wallet = this.futuresWallet;
    const positions = wallet.positions;
    const position = positions.find((pos) => pos.pair === pair);
    const { entryPrice, size, leverage } = position;
    const fees = price * quantity * (TAKER_FEES / 100);
    const hadPosition = position.size !== 0;

    if (quantity < 0) {
      console.error(
        `Cannot execute the market order for ${pair}. The quantity is malformed: ${quantity}`
      );
      return;
    }

    if (side === 'BUY') {
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

          if (!hadPosition) {
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
        let hadPosition = position.size < 0;

        // Update wallet
        let pnl = this.getPositionPNL(position, price);
        wallet.availableBalance += position.margin + pnl - fees;
        wallet.totalWalletBalance += pnl - fees;

        // Update strategy report
        this.updateProfitLossStrategyProperty(pnl);

        // Update position
        position.size += quantity;
        position.margin = Math.abs(position.size * price) / leverage;

        if (position.size === 0) {
          position.entryPrice = 0;
          position.unrealizedProfit = 0;
        }

        if (position.size > 0) {
          position.entryPrice = price;
          position.positionSide = 'LONG';
          let newPnl = this.getPositionPNL(position, price);
          position.unrealizedProfit = newPnl;
          wallet.availableBalance -= position.margin;
          this.strategyReport.totalTrades++;
          this.strategyReport.totalLongTrades++;
        }

        this.strategyReport.totalFees += fees;
        if (hadPosition && entryPrice >= price)
          this.strategyReport.longWinningTrade++;
        if (hadPosition && entryPrice < price)
          this.strategyReport.longLostTrade++;

        log(
          `Take a long position on ${pair} with a size of ${quantity} at ${price}. Fees: ${fees}`,
          chalk.green
        );
      }
    } else if (side === 'SELL') {
      let baseCost = (price * quantity) / leverage;

      if (position.positionSide === 'SHORT') {
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

          if (!hadPosition) {
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
        let hadPosition = position.size > 0;

        // Update wallet
        let pnl = this.getPositionPNL(position, price);
        wallet.availableBalance += position.margin + pnl - fees;
        wallet.totalWalletBalance += pnl - fees;

        // Update strategy report
        this.updateProfitLossStrategyProperty(pnl);

        // Update position
        position.size -= quantity;
        position.margin = Math.abs(position.size * price) / leverage;

        if (position.size === 0) {
          position.entryPrice = 0;
          position.unrealizedProfit = 0;
        }

        if (position.size < 0) {
          position.entryPrice = price;
          position.positionSide = 'SHORT';
          let newPnl = this.getPositionPNL(position, price);
          position.unrealizedProfit = newPnl;
          wallet.availableBalance -= position.margin;
          this.strategyReport.totalTrades++;
          this.strategyReport.totalShortTrades++;
        }

        this.strategyReport.totalFees += fees;
        if (hadPosition && entryPrice <= price)
          this.strategyReport.shortWinningTrade++;
        if (hadPosition && entryPrice > price)
          this.strategyReport.shortLostTrade++;

        log(
          `Take a short position on ${pair} with a size of ${-quantity} at ${price}. Fees: ${fees}`,
          chalk.red
        );
      }
    }
  }

  private futuresOrderLimit(
    pair: string,
    price: number,
    quantity: number,
    positionSide: 'LONG' | 'SHORT'
  ) {
    const position = this.futuresWallet.positions.find(
      (pos) => pos.pair === pair
    );

    if (quantity < 0) {
      console.error(
        `Cannot placed the limit order for ${pair}. The quantity is malformed: ${quantity}`
      );
      return;
    }

    let baseCost =
      Math.abs(price * quantity) / position.leverage - position.margin;
    let canOrder = this.futuresWallet.availableBalance >= baseCost;

    if (canOrder) {
      let order: FuturesOpenOrder = {
        id: Math.random().toString(16).slice(2),
        pair,
        type: 'LIMIT',
        positionSide,
        price,
        quantity,
      };
      this.futuresOpenOrders.push(order);
      log(
        `Create a new ${
          positionSide === 'LONG' ? 'buy' : 'sell'
        } limit order #${order.id} on ${pair} with size ${Math.abs(
          quantity
        )} at ${price}`,
        chalk.magenta
      );
    } else {
      console.error(
        `Limit order for the pair ${pair} cannot be placed. quantity=${quantity} price=${price}`
      );
    }
  }

  private futuresOrderTrailingStop(
    asset: string,
    base: string,
    price: number,
    quantity: number,
    positionSide: 'LONG' | 'SHORT',
    callbackRate: number,
    activation: { changePercentage?: number; percentageToTP: number }
  ) {
    const wallet = this.futuresWallet;
    const positions = wallet.positions;
    const position = positions.find((pos) => pos.pair === asset);
    const pair = asset + base;

    if (quantity < 0) {
      console.error(
        `Cannot execute the trailing stop order for ${pair}. The quantity is malformed: ${quantity}`
      );
      return;
    }

    let canOrder = quantity <= Math.abs(position.size);
    if (canOrder) {
      let order: FuturesOpenOrder = {
        id: Math.random().toString(16).slice(2),
        pair,
        type: 'TRAILING_STOP_MARKET',
        positionSide,
        price, // activation price
        quantity,
        trailingStop: {
          status: 'PENDING',
          callbackRate,
          activation: {
            changePercentage: activation.changePercentage,
            percentageToTP: activation.changePercentage,
          },
        },
      };
      this.futuresOpenOrders.push(order);
      log(
        `Create a trailing stop order #${order.id} on ${pair}`,
        chalk.magenta
      );
    } else {
      console.error(
        `Trailing stop order for the pair ${pair} cannot be placed`
      );
    }
  }
}
