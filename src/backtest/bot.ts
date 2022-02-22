import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import csv from 'csv-parser';
import dayjs from 'dayjs';
import cliProgress from 'cli-progress';
import colors from 'ansi-colors';
import { CandleChartInterval, ExchangeInfo, OrderSide } from 'binance-api-node';
import { binanceClient, BINANCE_MODE } from '..';
import { createDatabase, saveState, saveFuturesState } from './db';
import { decimalCeil, decimalFloor } from '../utils/math';
import { debugLastCandle, debugWallet, log, printDateBanner } from './debug';
import {
  durationBetweenDates,
  dateMatchTimeFrame,
  timeFrameToMinutes,
  compareTimeFrame,
} from '../utils/time';
import {
  getPricePrecision,
  getQuantityPrecision,
  isValidQuantity,
} from '../utils/rules';

// ====================================================================== //

const bar = new cliProgress.SingleBar(
  {
    format:
      'Progress: |' + colors.blue('{bar}') + '| {percentage}% | date: {date}',
  },
  cliProgress.Presets.shades_classic
);

// ====================================================================== //

function clone(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  let props = Object.getOwnPropertyDescriptors(obj);
  for (let prop in props) {
    props[prop].value = clone(props[prop].value);
  }
  return Object.create(Object.getPrototypeOf(obj), props);
}

// ====================================================================== //

// Save the backtest history to the database
const SAVE_HISTORY = false;

// Debug mode with console.log
export const DEBUG = process.argv[2]
  ? process.argv[2].split('=')[1] === 'true'
    ? true
    : false
  : false;

// Max length of the candle arrays needed for the strategy and the calculation of indicators
// Better to have the minimum to get a higher performance
const MAX_LENGTH_CANDLES = 50;

// Supported time frame in backtest mode
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
];

// ====================================================================== //

// Exchange fee info
const TAKER_FEES = 0.04; // %
const MAKER_FEES = 0.02; // %

// ====================================================================== //

export class BackTestBot {
  private tradeConfigs: TradeConfig[];
  private historicCandles: { [symbol: string]: CandleData[] };
  private startDate: Date;
  private endDate: Date;

  private wallet: Wallet;
  private futuresWallet: FuturesWallet;
  private openOrders: OpenOrder[];
  private futuresOpenOrders: FuturesOpenOrder[];

  private strategyResults: StrategyResults;

  constructor(tradeConfigs: TradeConfig[], startDate: Date, endDate: Date) {
    this.tradeConfigs = tradeConfigs;
    this.startDate = startDate;
    this.endDate = endDate;
    this.historicCandles = {};
  }

  public prepare(initialCapital: number) {
    if (SAVE_HISTORY) createDatabase();

    let numberAssetsInBalance = 0;

    if (BINANCE_MODE === 'spot') {
      this.wallet = { balance: [] };
      this.openOrders = [];
      const balance = this.wallet.balance;

      this.tradeConfigs.forEach(({ base, asset }) => {
        // Add base balance
        if (!balance.some((balance) => balance.symbol === base)) {
          balance.push({
            symbol: base,
            quantity: initialCapital,
          });
        }
        // Add asset balance
        if (!balance.some((balance) => balance.symbol === asset)) {
          balance.push({
            symbol: asset,
            quantity: 0,
          });
          numberAssetsInBalance++;
        }
      });
    } else {
      this.futuresWallet = {
        availableBalance: initialCapital,
        totalWalletBalance: initialCapital,
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
    this.strategyResults.initialDeposit = initialCapital;
    this.strategyResults.numberSymbol =
      BINANCE_MODE === 'spot'
        ? numberAssetsInBalance
        : this.futuresWallet.positions.length;
    this.strategyResults.totalNetProfit = 0;
    this.strategyResults.totalTrades = 0;
    this.strategyResults.totalLongTrades = 0;
    this.strategyResults.totalShortTrades = 0;
    this.strategyResults.totalProfit = 0;
    this.strategyResults.totalLoss = 0;
    this.strategyResults.longWinningTrade = 0;
    this.strategyResults.longLostTrade = 0;
    this.strategyResults.shortWinningTrade = 0;
    this.strategyResults.shortLostTrade = 0;
  }

  public async run() {
    log(
      '====================== 💵 BINANCE TRADING BOT (BACKTEST) 💵 ======================',
      chalk.white
    );

    // Get exchange info
    const exchangeInfo =
      BINANCE_MODE === 'spot'
        ? await binanceClient.exchangeInfo()
        : await binanceClient.futuresExchangeInfo();

    // Save all candle data
    await Promise.all(
      this.tradeConfigs.map(
        ({ base, asset, loopInterval }) =>
          new Promise<void>((resolve, reject) => {
            const pair = asset + base;
            this.loadCandles(pair, loopInterval)
              .then((candles) => {
                this.historicCandles[pair] = candles;
                resolve();
              })
              .catch(reject);
          })
      )
    );

    // Check if the candle data are available on the specified period
    let historyError = false;
    Object.keys(this.historicCandles).forEach((symbol) => {
      if (this.historicCandles[symbol].length === 0) {
        historyError = true;
        console.error(
          `No candle data has been found on the pair ${symbol} for the period: ${dayjs(
            this.startDate
          ).format('YYYY-MM-DD HH:mm:ss')} to ${dayjs(this.endDate).format(
            'YYYY-MM-DD HH:mm:ss'
          )}`
        );
      }
    });
    if (historyError) return process.exit();

    // Get the smaller time frame on the configs
    const smallerTimeFrame = this.tradeConfigs
      .map(({ loopInterval, indicatorInterval }) => {
        if (!indicatorInterval) return loopInterval;
        else
          return timeFrameToMinutes(indicatorInterval) >
            timeFrameToMinutes(loopInterval)
            ? loopInterval
            : indicatorInterval;
      })
      .sort((tf1, tf2) => compareTimeFrame(tf1, tf2))[0];

    // Duration of the backtest period in minutes
    const duration = durationBetweenDates(
      this.startDate,
      this.endDate,
      smallerTimeFrame
    );

    // Set property for strategy
    this.strategyResults.totalBars = duration;

    // Initiation of CLI Progress bar
    if (!DEBUG) bar.start(duration, 0);

    // Index to generated candle arrays progressively
    let index: { [pair: string]: { start: number; end: number } } = {};
    this.tradeConfigs.forEach((config) => {
      index[config.asset + config.base] = { start: 0, end: 0 };
    });

    // Time loop
    let currentDate = this.startDate;
    while (dayjs(currentDate).isSameOrBefore(this.endDate)) {
      printDateBanner(currentDate);

      this.tradeConfigs.forEach((config) => {
        const { base, asset } = config;
        const pair = asset + base;

        // Generate the array of candles progressively by determining the part of historic candle data to take
        for (
          let i = index[pair].end;
          i < this.historicCandles[pair].length;
          i++
        ) {
          let pairCandles = this.historicCandles[pair];
          if (dayjs(pairCandles[i].closeTime).isAfter(currentDate) && i > 0) {
            index[pair].end = i - 1;
            break;
          }
          if (i - index[pair].start > MAX_LENGTH_CANDLES) index[pair].start++;
        }
        let candles = this.historicCandles[pair].slice(
          index[pair].start,
          index[pair].end
        );

        if (candles.length > 0) {
          debugLastCandle(candles[candles.length - 1]);

          // Check if an open order has been activated
          if (BINANCE_MODE === 'spot') {
            this.checkSpotOpenOrders(asset, base, candles);
          } else {
            this.checkFuturesOpenOrders(asset, base, candles);
            this.updatePNL(asset, base, candles[candles.length - 1].close);
          }

          if (
            dateMatchTimeFrame(
              currentDate,
              config.indicatorInterval || config.loopInterval
            )
          ) {
            if (BINANCE_MODE === 'spot') {
              this.tradeWithSpot(config, candles, exchangeInfo);
            } else {
              this.tradeWithFutures(config, candles, exchangeInfo);
              this.updatePNL(asset, base, candles[candles.length - 1].close);
            }
          }
        }
      });

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

      debugWallet(this.wallet, this.futuresWallet);
      log(''); // \n

      if (!DEBUG)
        bar.increment(1, {
          date: dayjs(currentDate).format('YYYY-MM-DD HH:mm'),
        });

      currentDate = dayjs(currentDate)
        .add(timeFrameToMinutes(smallerTimeFrame), 'minute')
        .toDate();
    }

    if (!DEBUG) bar.stop();
  }

  private tradeWithSpot(
    tradeConfig: TradeConfig,
    candles: CandleData[],
    exchangeInfo: ExchangeInfo
  ) {
    const {
      asset,
      base,
      risk,
      buySignal,
      sellSignal,
      tpslStrategy,
      riskManagement,
      allowPyramiding,
      maxPyramidingAllocation,
    } = tradeConfig;
    const pair = asset + base;

    // Balance information
    const balance = this.wallet.balance;
    const indexBase = balance.findIndex((bal) => bal.symbol === base);
    const indexAsset = balance.findIndex((bal) => bal.symbol === asset);
    const assetBalance = balance[indexAsset].quantity;
    const baseBalance = balance[indexBase].quantity;

    // Data
    const currentPrice = candles[candles.length - 1].close;
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

    // If a trade exists, search when to sell
    if (assetBalance > 0) {
      if (sellSignal(candles)) {
        this.spotOrderMarket(asset, base, currentPrice, assetBalance, 'SELL');
        this.closeOpenOrders(pair);
      }
    } else if (canBuy && buySignal(candles)) {
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
      // @NOTES => calculate the average price

      // Calculate the tp and sl
      const { takeProfits, stopLoss } = tpslStrategy
        ? tpslStrategy(currentPrice, candles, pricePrecision, OrderSide.BUY)
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
    candles: CandleData[],
    exchangeInfo: ExchangeInfo
  ) {
    const {
      asset,
      base,
      risk,
      buySignal,
      sellSignal,
      tpslStrategy,
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

    // Other data
    const currentPrice = candles[candles.length - 1].close;
    const currentOpenOrders = this.futuresOpenOrders;
    const pricePrecision = getPricePrecision(pair, exchangeInfo);
    const quantityPrecision = getQuantityPrecision(pair, exchangeInfo);

    // Prevent remaining open orders when all the take profit or a stop loss has been filled
    if (!hasLongPosition && !hasShortPosition && currentOpenOrders.length > 0) {
      this.closeFuturesOpenOrders(pair);
    }

    if (canTakeLongPosition && buySignal(candles)) {
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

      // Calculate TP and SL
      const { takeProfits, stopLoss } =
        !allowPyramiding && tpslStrategy
          ? tpslStrategy(currentPrice, candles, pricePrecision, OrderSide.BUY)
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

      if (takeProfits.length > 0) {
        // Create the take profit orders
        takeProfits.forEach(({ price, quantityPercentage }) => {
          // Take profit order
          this.futuresOrderLimit(
            pair,
            price,
            decimalFloor(
              Math.abs(position.size) * quantityPercentage,
              quantityPrecision
            ),
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
          calculateActivationPrice(currentPrice),
          Math.abs(position.size),
          'SHORT',
          trailingStopConfig.callbackRate,
          trailingStopConfig.activation
        );
      }
    } else if (canTakeShortPosition && sellSignal(candles)) {
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

      // Calculate TP and SL
      const { takeProfits, stopLoss } =
        !allowPyramiding && tpslStrategy
          ? tpslStrategy(currentPrice, candles, pricePrecision, OrderSide.SELL)
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

      if (takeProfits.length > 0) {
        // Create the take profit orders
        takeProfits.forEach(({ price, quantityPercentage }) => {
          // Take profit order
          this.futuresOrderLimit(
            pair,
            price,
            decimalFloor(
              Math.abs(position.size) * quantityPercentage,
              quantityPrecision
            ),
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
          calculateActivationPrice(currentPrice),
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
      if (!supportedTimeFrames.some((tf) => tf === interval)) {
        reject(
          `You use a time frame not supported in backtest mode: ${interval}`
        );
      }

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
      const balance = this.wallet.balance;
      const baseBalance = balance.find((bal) => bal.symbol === base);
      const assetBalance = balance.find((bal) => bal.symbol === asset);

      // Check if a buy order has been activated on the last candle
      buyOrders.forEach(({ id, price, quantity }) => {
        // Price crossed the buy limit order
        if (lastCandle.high > price && lastCandle.low < price) {
          let cost = quantity * price;
          // Convert base to asset
          if (baseBalance.quantity >= cost) {
            baseBalance.quantity -= cost;
            assetBalance.quantity += quantity;
            log(`Buy order #${id} has been activated`, chalk.magenta);
            // Close the order
            this.closeOpenOrder(id);
          }
        }
      });

      // Check if a sell order has been activated on the last candle
      sellOrders.forEach(({ id, price, quantity }) => {
        // Price crossed the sell limit order
        if (lastCandle.high > price && lastCandle.low < price) {
          let profit = quantity * price;
          // Convert asset to base
          if (assetBalance.quantity >= quantity) {
            assetBalance.quantity -= quantity;
            baseBalance.quantity += profit;
            log(`Sell order #${id} has been activated`, chalk.magenta);
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
      longOrders.forEach(({ id, price, quantity, type, trailingStop }) => {
        let { entryPrice, size, leverage } = position;

        // Price crossed the buy limit order
        if (lastCandle.high > price && lastCandle.low < price) {
          if (type === 'LIMIT') {
            // Average the position
            if (position.positionSide === 'LONG') {
              let baseCost = (price * quantity) / leverage;
              // If there is enough available base
              if (wallet.availableBalance >= baseCost) {
                let avgEntryPrice =
                  (price * quantity + entryPrice * Math.abs(size)) /
                  (quantity + Math.abs(size));
                position.margin += baseCost;
                position.size += quantity;
                position.entryPrice = avgEntryPrice;
                wallet.availableBalance -= baseCost;
              }

              this.strategyResults.totalTrades++;
              this.strategyResults.totalLongTrades++;

              log(
                `Long order #${id} has been activated for ${quantity} ${asset} at $${price}`,
                chalk.magenta
              );
            } else if (position.positionSide === 'SHORT') {
              let hadPosition = position.size < 0;

              // Update wallet
              let pnl = this.getPositionPNL(position, price);
              wallet.availableBalance += position.margin + pnl;
              wallet.totalWalletBalance += pnl;

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
                this.strategyResults.totalTrades++;
                this.strategyResults.totalLongTrades++;
              }

              if (hadPosition && entryPrice >= price)
                this.strategyResults.longWinningTrade++;
              if (hadPosition && entryPrice < price)
                this.strategyResults.longLostTrade++;

              log(
                `${
                  entryPrice < price
                    ? '[SL]'
                    : entryPrice > price
                    ? '[TP]'
                    : '[BE]'
                } Long order #${id} has been activated for ${quantity} ${asset} at $${price}`,
                chalk.magenta
              );
            }

            this.closeFutureOpenOrder(id);
          } else if (type === 'TRAILING_STOP_MARKET') {
            let { status, callbackRate, activation } = trailingStop;
            if (status === 'PENDING') {
              if (
                (activation.changePercentage &&
                  lastCandle.low < price * (1 - activation.changePercentage)) ||
                // (activation.percentageToTP &&
                //   lastCandle.low < price * (1 - activation.percentageToTP)) ||
                (!activation.changePercentage && !activation.percentageToTP)
              )
                status = 'ACTIVE';
            } else if (status === 'ACTIVE') {
              let prevCandle = candles[candles.length - 2];
              let stopLoss = prevCandle.close * (1 + callbackRate);
              // Trailing stop loss is activated
              if (lastCandle.high >= stopLoss) {
                let pnl = this.getPositionPNL(position, price);
                wallet.availableBalance += position.margin + pnl;
                wallet.totalWalletBalance += pnl;
                log(
                  `Trailing stop buy order #${id} has been activated for ${quantity} ${asset} at $${price}`,
                  chalk.magenta
                );
              }
            }
          }
        }
      });

      shortOrders.forEach(({ id, price, quantity, type, trailingStop }) => {
        let { entryPrice, size, leverage } = position;

        // Price crossed the sell limit order
        if (lastCandle.high > price && lastCandle.low < price) {
          // If there is enough available base
          if (type === 'LIMIT') {
            // Average the position
            if (position.positionSide === 'SHORT') {
              let baseCost = (price * quantity) / leverage;
              // If there is enough available base
              if (wallet.availableBalance >= baseCost) {
                let avgEntryPrice =
                  (price * quantity + entryPrice * Math.abs(size)) /
                  (quantity + Math.abs(size));
                position.margin += baseCost;
                position.size -= quantity;
                position.entryPrice = avgEntryPrice;
                wallet.availableBalance -= baseCost;
              }

              this.strategyResults.totalTrades++;
              this.strategyResults.totalShortTrades++;

              log(
                `Sell order #${id} has been activated for ${Math.abs(
                  quantity
                )} ${asset} at $${price}`,
                chalk.magenta
              );
            } else if (position.positionSide === 'LONG') {
              let hadPosition = position.size > 0;

              // Update wallet
              let pnl = this.getPositionPNL(position, price);
              wallet.availableBalance += position.margin + pnl;
              wallet.totalWalletBalance += pnl;

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
                this.strategyResults.totalTrades++;
                this.strategyResults.totalShortTrades++;
              }

              if (hadPosition && entryPrice <= price)
                this.strategyResults.longWinningTrade++;
              if (hadPosition && entryPrice > price)
                this.strategyResults.longLostTrade++;

              log(
                `${
                  entryPrice > price
                    ? '[SL]'
                    : entryPrice < price
                    ? '[TP]'
                    : '[BE]'
                } Sell order #${id} has been activated for ${quantity} ${asset} at $${price}`,
                chalk.magenta
              );
            }

            this.closeFutureOpenOrder(id);
          } else if (type === 'TRAILING_STOP_MARKET') {
            let { status, callbackRate, activation } = trailingStop;
            if (status === 'PENDING') {
              if (
                (activation.changePercentage &&
                  lastCandle.low < price * (1 + activation.changePercentage)) ||
                // (activation.percentageToTP &&
                //   lastCandle.low < price * (1 + activation.percentageToTP)) ||
                (!activation.changePercentage && !activation.percentageToTP)
              )
                status = 'ACTIVE';
            } else if (status === 'ACTIVE') {
              let prevCandle = candles[candles.length - 2];
              let stopLoss = prevCandle.close * (1 - callbackRate);
              // Trailing stop loss is activated
              if (lastCandle.low <= stopLoss) {
                let pnl = this.getPositionPNL(position, price);
                wallet.availableBalance += position.margin + pnl;
                wallet.totalWalletBalance += pnl;

                log(
                  `Trailing stop sell order #${id} has been activated for ${Math.abs(
                    quantity
                  )} ${asset} at $${price}`,
                  chalk.magenta
                );
              }
            }
          }
        }
      });
    }
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
    log(`Close all the open orders for the pair ${pair}`, chalk.cyan);
  }

  private closeFuturesOpenOrders(pair: string) {
    this.futuresOpenOrders = this.futuresOpenOrders.filter(
      (order) => order.pair !== pair
    );
    log(`Close all the open orders for the pair ${pair}`, chalk.cyan);
  }

  private spotOrderMarket(
    asset: string,
    base: string,
    price: number,
    quantity: number,
    side: 'BUY' | 'SELL'
  ) {
    const balance = this.wallet.balance;
    const baseBalance = balance.find((bal) => bal.symbol === base);
    const assetBalance = balance.find((bal) => bal.symbol === asset);

    if (side === 'BUY') {
      let baseCost = quantity * price;
      // If have enough base to buy
      if (baseBalance.quantity >= baseCost) {
        baseBalance.quantity -= baseCost;
        assetBalance.quantity += quantity;

        log(
          `Buy ${quantity} ${asset} at $${price} for $${baseCost}`,
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
      // If have enough asset to sell
      if (assetBalance.quantity >= quantity) {
        let profit = price * quantity;
        assetBalance.quantity -= quantity;
        baseBalance.quantity += profit;

        log(`Sell ${quantity} ${asset} at $${price} for $${profit}`, chalk.red);
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
    const balance = this.wallet.balance;
    const indexBase = balance.findIndex((bal) => bal.symbol === base);
    const indexAsset = balance.findIndex((bal) => bal.symbol === asset);

    let canOrder =
      side === 'BUY'
        ? balance[indexBase].quantity >= quantity * price
        : balance[indexAsset].quantity >= quantity;
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
        } for ${quantity} ${asset} at $${price}`,
        chalk.magenta
      );
    } else {
      console.error(
        `Limit order for the pair ${asset + base} cannot be placed`
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
        if (wallet.availableBalance >= baseCost) {
          let avgEntryPrice =
            (price * quantity + entryPrice * Math.abs(size)) /
            (quantity + Math.abs(size));
          position.margin += baseCost;
          position.size += quantity;
          position.entryPrice = avgEntryPrice;
          wallet.availableBalance -= baseCost;

          log(
            `Take a long position on ${pair} with a size of ${quantity} at $${price}`,
            chalk.green
          );

          this.strategyResults.totalTrades++;
          this.strategyResults.totalLongTrades++;
        }
      } else if (position.positionSide === 'SHORT') {
        let hadPosition = position.size < 0;

        // Update wallet
        let pnl = this.getPositionPNL(position, price);
        wallet.availableBalance += position.margin + pnl;
        wallet.totalWalletBalance += pnl;

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
          this.strategyResults.totalTrades++;
          this.strategyResults.totalLongTrades++;
        }

        if (hadPosition && entryPrice >= price)
          this.strategyResults.longWinningTrade++;
        if (hadPosition && entryPrice < price)
          this.strategyResults.longLostTrade++;

        log(
          `Take a long position on ${pair} with a size of ${quantity} at $${price}`,
          chalk.green
        );
      }
    } else if (side === 'SELL') {
      let baseCost = (price * quantity) / leverage;

      if (position.positionSide === 'SHORT') {
        // If there is enough available base
        if (wallet.availableBalance >= baseCost) {
          let avgEntryPrice =
            (price * quantity + entryPrice * Math.abs(size)) /
            (quantity + Math.abs(size));
          position.margin += baseCost;
          position.size -= quantity;
          position.entryPrice = avgEntryPrice;
          wallet.availableBalance -= baseCost;

          log(
            `Take a short position on ${pair} with a size of ${-quantity} at $${price}`,
            chalk.red
          );

          this.strategyResults.totalTrades++;
          this.strategyResults.totalShortTrades++;
        }
      } else if (position.positionSide === 'LONG') {
        let hadPosition = position.size > 0;

        // Update wallet
        let pnl = this.getPositionPNL(position, price);
        wallet.availableBalance += position.margin + pnl;
        wallet.totalWalletBalance += pnl;

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
          this.strategyResults.totalTrades++;
          this.strategyResults.totalShortTrades++;
        }

        if (hadPosition && entryPrice <= price)
          this.strategyResults.longWinningTrade++;
        if (hadPosition && entryPrice > price)
          this.strategyResults.longLostTrade++;

        log(
          `Take a short position on ${pair} with a size of ${-quantity} at $${price}`,
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
    let position = this.futuresWallet.positions.find(
      (pos) => pos.pair === pair
    );

    if (quantity < 0) {
      console.error(
        `Cannot placed the limit order for ${pair}. The quantity is malformed: ${quantity}`
      );
      return;
    }

    let baseCost = (price * quantity) / position.leverage;
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
        )} at $${price}`,
        chalk.magenta
      );
    } else {
      console.error(`Limit order for the pair ${pair} cannot be placed`);
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

    let canOrder = quantity <= position.size;
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