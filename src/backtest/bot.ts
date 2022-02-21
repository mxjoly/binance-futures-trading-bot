import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import csv from 'csv-parser';
import dayjs from 'dayjs';
import { CandleChartInterval, ExchangeInfo, OrderSide } from 'binance-api-node';
import { binanceClient, BINANCE_MODE } from '..';
import { createDatabase, saveState, saveFuturesState } from './db';
import {
  getPricePrecision,
  getQuantityPrecision,
  isValidQuantity,
} from '../utils/rules';
import { decimalFloor } from '../utils/math';

const WRITE_STATE_TO_JSON = false;

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

export class BackTestBot {
  private tradeConfigs: TradeConfig[];
  private historicCandles: { [symbol: string]: CandleData[] };
  private startDate: Date;
  private endDate: Date;

  private wallet: Wallet;
  private futuresWallet: FuturesWallet;
  private openOrders: OpenOrder[];
  private futuresOpenOrders: FuturesOpenOrder[];

  constructor(tradeConfigs: TradeConfig[], startDate: Date, endDate: Date) {
    this.tradeConfigs = tradeConfigs;
    this.startDate = startDate;
    this.endDate = endDate;
    this.historicCandles = {};
  }

  public async prepare(initialCapital: number) {
    createDatabase();

    if (BINANCE_MODE === 'spot') {
      const balance = this.wallet.balance;
      this.wallet = { balance: [] };
      this.openOrders = [];

      this.tradeConfigs.forEach(({ base, asset }) => {
        // Add base balance
        if (!balance.some((balance) => balance.symbol === base)) {
          balance.push({
            symbol: base,
            quantity: initialCapital,
          });
          // Add asset balance
          if (!balance.some((balance) => balance.symbol === asset)) {
            balance.push({
              symbol: base,
              quantity: 0,
            });
          }
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
  }

  public async run() {
    // Get exchange info
    const exchangeInfo =
      BINANCE_MODE === 'spot'
        ? await binanceClient.exchangeInfo()
        : await binanceClient.futuresExchangeInfo();

    // Save all candle data
    let saveCandles = [];
    this.tradeConfigs.forEach(({ base, asset, loopInterval }) => {
      saveCandles.push(
        new Promise<void>((resolve, reject) => {
          const pair = asset + base;
          this.loadCandles(pair, loopInterval)
            .then((candles) => {
              this.historicCandles[pair] = candles;
              resolve();
            })
            .catch(reject);
        })
      );
    });
    await Promise.all(saveCandles);

    // Time loop
    let currentDate = this.startDate;
    while (dayjs(currentDate).isSameOrBefore(this.endDate)) {
      this.tradeConfigs.forEach((config) => {
        let { base, asset } = config;

        // Generate the array of candles progressively with the historic
        let currentCandles = this.historicCandles[asset + base]
          .filter((candle) =>
            dayjs(candle.closeTime).isSameOrBefore(currentDate)
          )
          .sort((a, b) => a.openTime.getTime() - b.openTime.getTime());

        // Don't overcharge the memory
        const maximumLength = 500;
        if (currentCandles.length > maximumLength) currentCandles.shift();

        if (currentCandles.length > 0) {
          if (BINANCE_MODE === 'spot') {
            this.checkSpotOpenOrders(asset, base, currentCandles);
            this.tradeWithSpot(config, currentCandles, exchangeInfo);
          } else {
            this.checkFuturesOpenOrders(asset, base, currentCandles);
            this.tradeWithFutures(config, currentCandles, exchangeInfo);
            this.updatePNL(
              asset,
              base,
              currentCandles[currentCandles.length - 1].close
            );
          }
        }
      });

      if (BINANCE_MODE === 'spot') {
        if (WRITE_STATE_TO_JSON)
          saveState(
            dayjs(currentDate).format('YYYY-MM-DD HH:mm:ss'),
            this.wallet,
            this.openOrders
          );
      } else {
        this.updateTotalPNL();
        if (WRITE_STATE_TO_JSON)
          saveFuturesState(
            dayjs(currentDate).format('YYYY-MM-DD HH:mm:ss'),
            this.futuresWallet,
            this.futuresOpenOrders
          );
      }

      currentDate = dayjs(currentDate).add(1, 'minute').toDate();
    }

    console.log(this.futuresWallet.totalWalletBalance);
  }

  private async tradeWithSpot(
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

    const { balances } = await binanceClient.accountInfo();
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
        this.spotOrderMarket(asset, base, currentPrice, assetBalance, 'SELL')
          .then(() => {
            this.closeOpenOrders(pair);
            const totalValue = currentPrice * Number(assetBalance);
            console.log(
              `Sells ${assetBalance}${asset} for ${totalValue}${base}.`
            );
          })
          .catch(console.error);
      }
    } else if (canBuy && buySignal(candles)) {
      const quantity = riskManagement({
        asset,
        base,
        balance: baseBalance,
        risk,
        enterPrice: currentPrice,
        leverage: 1,
        exchangeInfo,
      });

      // Buy market order
      this.spotOrderMarket(asset, base, currentPrice, quantity, 'BUY')
        .then(({ price: orderPrice }) => {
          // @NOTES => calculate the average price

          // Calculate the tp and sl
          const { takeProfits, stopLoss } = tpslStrategy
            ? tpslStrategy(currentPrice, candles, pricePrecision, OrderSide.BUY)
            : { takeProfits: [], stopLoss: null };

          // Remove the current open orders to update them
          if (currentOpenOrders.length > 0) this.closeOpenOrders(pair);

          return { orderPrice, takeProfits, stopLoss };
        })
        .then(({ orderPrice, stopLoss, takeProfits }) => {
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
              ).catch(console.error);
            });
          }

          if (stopLoss) {
            // Sell limit order as SL
            this.spotOrderLimit(asset, base, stopLoss, quantity, 'SELL').catch(
              console.error
            );
          }
        })
        .catch(console.error);
    }
  }

  private async tradeWithFutures(
    tradeConfig: TradeConfig,
    candles: CandleData[],
    exchangeInfo: ExchangeInfo
  ) {
    const {
      asset,
      base,
      risk,
      leverage,
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
      this.closeOpenOrders(pair);
    }

    if (canTakeLongPosition && buySignal(candles)) {
      // Take the profit and not open a new position
      if (hasShortPosition && unidirectional) {
        this.futuresOrderMarket(
          asset,
          base,
          currentPrice,
          position.size,
          'BUY'
        ).then(() => {
          this.closeOpenOrders(pair);
        });
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
        leverage,
        exchangeInfo,
      });

      // Quantity to add to close the previous position
      let previousPositionQuantity = hasShortPosition ? position.size : 0;

      // To close the previous short position
      if (
        isValidQuantity(quantity - previousPositionQuantity, pair, exchangeInfo)
      ) {
        quantity -= previousPositionQuantity;
      } else {
        throw new Error(`Invalid quantity order for ${pair}: ${quantity}`);
      }

      this.futuresOrderMarket(asset, base, currentPrice, quantity, 'BUY')
        .then(async ({ executedQty }) => {
          // Cancel the previous orders to update them
          if (currentOpenOrders.length > 0) {
            this.closeOpenOrders(pair);
          }

          if (trailingStopConfig) {
            let { percentageToTP, changePercentage } =
              trailingStopConfig.activation;

            const activationPrice = changePercentage
              ? currentPrice * (1 + changePercentage)
              : percentageToTP && takeProfits.length > 0
              ? currentPrice +
                (takeProfits[0].price - currentPrice) * percentageToTP
              : currentPrice;

            this.futuresOrderTrailingStop(
              asset,
              base,
              activationPrice,
              position.size,
              'SHORT',
              trailingStopConfig.callbackRate,
              { changePercentage, percentageToTP }
            ).catch(console.error);
          }

          if (takeProfits.length > 0) {
            // Create the take profit orders
            takeProfits.forEach(({ price, quantityPercentage }) => {
              // Take profit order
              this.futuresOrderLimit(
                asset,
                base,
                price,
                decimalFloor(
                  position.size * quantityPercentage,
                  quantityPrecision
                ),
                'SHORT'
              ).catch(console.error);
            });
          }

          if (stopLoss) {
            // Stop loss order
            this.futuresOrderLimit(
              asset,
              base,
              stopLoss,
              position.size,
              'SHORT'
            ).catch(console.error);
          }
        })
        .catch(console.error);
    } else if (canTakeShortPosition && sellSignal(candles)) {
      // Take the profit and not open a new position
      if (hasLongPosition && unidirectional) {
        this.futuresOrderMarket(
          asset,
          base,
          currentPrice,
          position.size,
          'SELL'
        ).then(() => {
          this.closeOpenOrders(pair);
        });
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
        leverage,
        exchangeInfo,
      });

      // Quantity to add to close the previous position
      let previousPositionQuantity = hasLongPosition
        ? Number(position.size)
        : 0;

      // To close the previous long position
      if (
        isValidQuantity(quantity + previousPositionQuantity, pair, exchangeInfo)
      ) {
        quantity += previousPositionQuantity;
      } else {
        throw new Error(`Invalid quantity order for ${pair}: ${quantity}`);
      }

      this.futuresOrderMarket(asset, base, currentPrice, quantity, 'SELL')
        .then(() => {
          // Cancel the previous orders to update them
          if (currentOpenOrders.length > 0) {
            this.closeOpenOrders(pair);
          }

          if (trailingStopConfig) {
            let { percentageToTP, changePercentage } =
              trailingStopConfig.activation;

            const activationPrice = changePercentage
              ? currentPrice * (1 - changePercentage)
              : percentageToTP && takeProfits.length > 0
              ? currentPrice -
                (currentPrice - takeProfits[0].price) * percentageToTP
              : currentPrice;

            this.futuresOrderTrailingStop(
              asset,
              base,
              activationPrice,
              position.size,
              'LONG',
              trailingStopConfig.callbackRate,
              { changePercentage, percentageToTP }
            ).catch(console.error);
          }

          if (takeProfits.length > 0) {
            // Create the take profit orders
            takeProfits.forEach(({ price, quantityPercentage }) => {
              // Take profit order
              this.futuresOrderLimit(
                asset,
                base,
                price,
                decimalFloor(
                  position.size * quantityPercentage,
                  quantityPrecision
                ),
                'LONG'
              ).catch(console.error);
            });
          }

          if (stopLoss) {
            // Stop loss order
            this.futuresOrderLimit(
              asset,
              base,
              stopLoss,
              position.size,
              'LONG'
            ).catch(console.error);
          }
        })
        .catch(console.error);
    }
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
      const indexBase = balance.findIndex((bal) => bal.symbol === base);
      const indexAsset = balance.findIndex((bal) => bal.symbol === asset);

      // Check if a buy order has been activated on the last candle
      buyOrders.forEach(({ id, price, quantity }) => {
        // Price crossed the buy limit order
        if (lastCandle.high > price && lastCandle.low < price) {
          let cost = quantity * price;
          // Convert base to asset
          if (balance[indexBase].quantity >= cost) {
            balance[indexBase].quantity -= cost;
            balance[indexAsset].quantity += quantity;
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
          if (balance[indexAsset].quantity >= quantity) {
            balance[indexAsset].quantity -= quantity;
            balance[indexBase].quantity += profit;
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
      const indexAsset = this.futuresWallet.positions.findIndex(
        (position) => position.pair === asset + base
      );

      const wallet = this.futuresWallet;
      const position = wallet.positions[indexAsset];

      // Check if a long order has been activated on the last candle
      longOrders.forEach(({ id, price, quantity, type, trailingStop }) => {
        let { entryPrice, size } = position;

        // Price crossed the buy limit order
        if (lastCandle.high > price && lastCandle.low < price) {
          if (type === 'LIMIT') {
            // Average the position
            if (position.positionSide === 'LONG') {
              let baseCost = price * quantity;
              // If there is enough available base
              if (wallet.availableBalance >= baseCost) {
                let avgEntryPrice =
                  (price * quantity + entryPrice * Math.abs(size)) /
                  (quantity + Math.abs(size));
                position.margin += baseCost;
                position.size += quantity;
                position.entryPrice = avgEntryPrice;
                wallet.availableBalance -= baseCost;
                this.closeOpenOrder(id);
              }
            } else if (position.positionSide === 'SHORT') {
              // Update wallet
              let pnl = this.getPositionPNL(position, price);
              wallet.availableBalance += quantity * price;
              wallet.totalWalletBalance += pnl;

              // Update position
              position.size += quantity;
              position.margin = Math.abs((quantity + position.size) * price);

              if (position.size === 0) {
                position.entryPrice = 0;
                position.unrealizedProfit = 0;
              }

              if (position.size > 0) {
                position.entryPrice = price;
                position.positionSide = 'LONG';
                let newPnl = this.getPositionPNL(position, price);
                position.unrealizedProfit = newPnl;
                wallet.availableBalance -= (quantity + position.size) * price;
              }

              this.closeOpenOrder(id);
            }
          } else if (type === 'TRAILING_STOP_MARKET') {
            let { status, callbackRate, activation } = trailingStop;
            if (status === 'PENDING') {
              if (
                (activation.changePercentage &&
                  lastCandle.low < price * (1 - activation.changePercentage)) ||
                (activation.percentageToTP &&
                  lastCandle.low < price * (1 - activation.percentageToTP)) ||
                (!activation.changePercentage && !activation.percentageToTP)
              )
                status = 'ACTIVE';
            } else if (status === 'ACTIVE') {
              let prevCandle = candles[candles.length - 2];
              let stopLoss = prevCandle.close * (1 + callbackRate);
              // Trailing stop loss is activated
              if (lastCandle.high >= stopLoss) {
                let pnl = this.getPositionPNL(position, price);
                wallet.availableBalance += quantity * price;
                wallet.totalWalletBalance += pnl;
                this.closeOpenOrders(asset + base);
              }
            }
          }
        }
      });

      shortOrders.forEach(({ id, price, quantity, type, trailingStop }) => {
        let { entryPrice, size } = position;

        // Price crossed the sell limit order
        if (lastCandle.high > price && lastCandle.low < price) {
          // If there is enough available base
          if (type === 'LIMIT') {
            // Average the position
            if (position.positionSide === 'SHORT') {
              let baseCost = price * quantity;
              // If there is enough available base
              if (wallet.availableBalance >= baseCost) {
                let avgEntryPrice =
                  (price * quantity + entryPrice * Math.abs(size)) /
                  (quantity + Math.abs(size));
                position.margin += baseCost;
                position.size -= quantity;
                position.entryPrice = avgEntryPrice;
                wallet.availableBalance -= baseCost;
                this.closeOpenOrder(id);
              }
            } else if (position.positionSide === 'LONG') {
              // Update wallet
              let pnl = this.getPositionPNL(position, price);
              wallet.availableBalance += quantity * price;
              wallet.totalWalletBalance += pnl;

              // Update position
              position.size -= quantity;
              position.margin = Math.abs((position.size - quantity) * price);

              if (position.size === 0) {
                position.entryPrice = 0;
                position.unrealizedProfit = 0;
              }

              if (position.size < 0) {
                position.entryPrice = price;
                position.positionSide = 'SHORT';
                let newPnl = this.getPositionPNL(position, price);
                position.unrealizedProfit = newPnl;
                wallet.availableBalance -= (position.size - quantity) * price;
              }

              this.closeOpenOrder(id);
            }
          } else if (type === 'TRAILING_STOP_MARKET') {
            let { status, callbackRate, activation } = trailingStop;
            if (status === 'PENDING') {
              if (
                (activation.changePercentage &&
                  lastCandle.low < price * (1 + activation.changePercentage)) ||
                (activation.percentageToTP &&
                  lastCandle.low < price * (1 + activation.percentageToTP)) ||
                (!activation.changePercentage && !activation.percentageToTP)
              )
                status = 'ACTIVE';
            } else if (status === 'ACTIVE') {
              let prevCandle = candles[candles.length - 2];
              let stopLoss = prevCandle.close * (1 - callbackRate);
              // Trailing stop loss is activated
              if (lastCandle.low <= stopLoss) {
                let pnl = this.getPositionPNL(position, price);
                wallet.availableBalance += quantity * price;
                wallet.totalWalletBalance += pnl;
                this.closeOpenOrders(asset + base);
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
    return totalPNL;
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

  private closeOpenOrder(orderId: number) {
    if (BINANCE_MODE === 'spot') {
      this.openOrders = this.openOrders.filter((order) => order.id !== orderId);
    } else {
      this.futuresOpenOrders = this.futuresOpenOrders.filter(
        (order) => order.id !== orderId
      );
    }
  }

  private closeOpenOrders(pair: string) {
    if (BINANCE_MODE === 'spot') {
      this.openOrders = this.openOrders.filter((order) => order.pair !== pair);
    } else {
      this.futuresOpenOrders = this.futuresOpenOrders.filter(
        (order) => order.pair !== pair
      );
    }
  }

  private spotOrderMarket(
    asset: string,
    base: string,
    price: number,
    quantity: number,
    side: 'BUY' | 'SELL'
  ) {
    return new Promise<{ executedQty: number; price: number }>(
      (resolve, reject) => {
        const balance = this.wallet.balance;
        const indexBase = balance.findIndex((bal) => bal.symbol === base);
        const indexAsset = balance.findIndex((bal) => bal.symbol === asset);

        if (side === 'BUY') {
          let baseCost = quantity * price;
          // If have enough base to buy
          if (balance[indexBase].quantity >= baseCost) {
            balance[indexBase].quantity -= baseCost;
            balance[indexAsset].quantity += quantity;

            resolve({ executedQty: quantity, price });
          } else {
            reject(`Not enough ${base} to buy ${asset}`);
          }
        }

        if (side === 'SELL') {
          // If have enough asset to sell
          if (balance[indexAsset].quantity >= quantity) {
            let profit = price * quantity;
            balance[indexAsset].quantity -= quantity;
            balance[indexBase].quantity += profit;

            resolve({ executedQty: quantity, price });
          } else {
            reject(`Not enough ${asset} to sell for ${base}`);
          }
        }
      }
    );
  }

  private spotOrderLimit(
    asset: string,
    base: string,
    price: number,
    quantity: number,
    side: 'BUY' | 'SELL'
  ) {
    return new Promise<OpenOrder>((resolve, reject) => {
      const balance = this.wallet.balance;
      const indexBase = balance.findIndex((bal) => bal.symbol === base);
      const indexAsset = balance.findIndex((bal) => bal.symbol === asset);

      let canOrder =
        side === 'BUY'
          ? balance[indexBase].quantity >= quantity * price
          : balance[indexAsset].quantity >= quantity;
      if (canOrder) {
        let order: OpenOrder = {
          id: new Date().getTime(),
          pair: asset + base,
          type: 'LIMIT',
          side,
          price,
          quantity,
        };
        this.openOrders.push(order);
        resolve(order);
      } else {
        reject(`Order for the pair ${asset + base} cannot be record`);
      }
    });
  }

  private futuresOrderMarket(
    asset: string,
    base: string,
    price: number,
    quantity: number,
    side: 'BUY' | 'SELL'
  ) {
    return new Promise<{ executedQty: number }>((resolve, reject) => {
      const wallet = this.futuresWallet;
      const positions = wallet.positions;
      const indexAsset = positions.findIndex(
        (pos) => pos.pair === asset + base
      );
      const position = positions[indexAsset];
      const { entryPrice, size } = position;

      if (side === 'BUY') {
        if (position.positionSide === 'LONG') {
          // Average the position
          let baseCost = price * quantity;
          // If there is enough available base
          if (wallet.availableBalance >= baseCost) {
            let avgEntryPrice =
              (price * quantity + entryPrice * Math.abs(size)) /
              (quantity + Math.abs(size));
            position.margin += baseCost;
            position.size += quantity;
            position.entryPrice = avgEntryPrice;
            wallet.availableBalance -= baseCost;

            console.log(
              chalk.green(
                `> Take long position on ${asset + base} with size ${quantity}`
              )
            );
            resolve({ executedQty: quantity });
          }
        } else if (position.positionSide === 'SHORT') {
          // Update wallet
          let pnl = this.getPositionPNL(position, price);
          wallet.availableBalance += quantity * price;
          wallet.totalWalletBalance += pnl;

          // Update position
          position.size += quantity;
          position.margin = Math.abs((quantity + position.size) * price);

          if (position.size === 0) {
            position.entryPrice = 0;
            position.unrealizedProfit = 0;
          }

          if (position.size > 0) {
            position.entryPrice = price;
            position.positionSide = 'LONG';
            let newPnl = this.getPositionPNL(position, price);
            position.unrealizedProfit = newPnl;
            wallet.availableBalance -= (quantity + position.size) * price;
          }

          console.log(
            chalk.green(
              `> Take long position on ${asset + base} with size ${quantity}`
            )
          );
          resolve({ executedQty: quantity });
        }
      } else if (position.positionSide === 'SHORT') {
        let baseCost = price * quantity;
        // If there is enough available base
        if (wallet.availableBalance >= baseCost) {
          let avgEntryPrice =
            (price * quantity + entryPrice * Math.abs(size)) /
            (quantity + Math.abs(size));
          position.margin += baseCost;
          position.size -= quantity;
          position.entryPrice = avgEntryPrice;
          wallet.availableBalance -= baseCost;

          console.log(
            chalk.red(
              `> Take short position on ${asset + base} with size ${quantity}`
            )
          );
          resolve({ executedQty: quantity });
        }
      } else if (position.positionSide === 'LONG') {
        // Update wallet
        let pnl = this.getPositionPNL(position, price);
        wallet.availableBalance += quantity * price;
        wallet.totalWalletBalance += pnl;

        // Update position
        position.size -= quantity;
        position.margin = Math.abs((position.size - quantity) * price);

        if (position.size === 0) {
          position.entryPrice = 0;
          position.unrealizedProfit = 0;
        }

        if (position.size < 0) {
          position.entryPrice = price;
          position.positionSide = 'SHORT';
          let newPnl = this.getPositionPNL(position, price);
          position.unrealizedProfit = newPnl;
          wallet.availableBalance -= (position.size - quantity) * price;
        }

        console.log(
          chalk.red(
            `> Take short position on ${asset + base} with size ${quantity}`
          )
        );
        resolve({ executedQty: quantity });
      }
    });
  }

  private futuresOrderLimit(
    asset: string,
    base: string,
    price: number,
    quantity: number,
    positionSide: 'LONG' | 'SHORT'
  ) {
    return new Promise<FuturesOpenOrder>((resolve, reject) => {
      let canOrder = this.futuresWallet.availableBalance >= price * quantity;
      if (canOrder) {
        let order: FuturesOpenOrder = {
          id: new Date().getTime(),
          pair: asset + base,
          type: 'LIMIT',
          positionSide,
          price,
          quantity,
        };
        this.futuresOpenOrders.push(order);
        console.log(
          chalk.white(
            `Create a new order ${
              positionSide === 'LONG' ? 'buy' : 'sell'
            } on ${asset + base} with size ${quantity}`
          )
        );
        resolve(order);
      } else {
        reject(`Order for the pair ${asset + base} cannot be record`);
      }
    });
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
    return new Promise<FuturesOpenOrder>((resolve, reject) => {
      const wallet = this.futuresWallet;
      const positions = wallet.positions;
      const indexAsset = positions.findIndex((pos) => pos.pair === asset);
      const position = positions[indexAsset];

      let canOrder = quantity <= position[indexAsset].size;
      if (canOrder) {
        let order: FuturesOpenOrder = {
          id: new Date().getTime(),
          pair: asset + base,
          type: 'TRAILING_STOP_MARKET',
          positionSide,
          price,
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
        console.log(chalk.yellow(`Create trailing stop on ${asset + base}`));
        resolve(order);
      }
    });
  }
}
