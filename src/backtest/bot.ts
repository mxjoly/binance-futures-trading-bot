import fs from 'fs';
import path from 'path';
import csv from 'csv-parser';
import time from 'date-and-time';
import { CandleChartInterval, ExchangeInfo } from 'binance-api-node';
import { binanceClient, BINANCE_MODE } from '..';
import {
  initDB,
  initOpenOrders,
  initFuturesOpenOrders,
  setWallet,
  setFuturesWallet,
} from './db';

// ====================================================================== //

export class BackTestBot {
  private tradeConfig: TradeConfig;
  private startDate: Date;
  private endDate: Date;

  constructor(tradeConfigs: TradeConfig[], startDate: Date, endDate: Date) {
    this.tradeConfig = tradeConfigs[0];
    this.startDate = startDate;
    this.endDate = endDate;
  }

  public async prepare(initialCapital: number) {
    initDB();
    if (BINANCE_MODE === 'spot') {
      const wallet: Wallet = {
        balance: [{ symbol: this.tradeConfig.base, quantity: initialCapital }],
        trades: [],
      };
      setWallet(this.startDate, wallet);
      initOpenOrders(this.startDate);
    } else {
      const wallet: FuturesWallet = {
        availableBalance: initialCapital,
        totalWalletBalance: initialCapital,
        totalUnrealizedProfit: 0,
        positions: [],
      };
      setFuturesWallet(this.startDate, wallet);
      initFuturesOpenOrders(this.startDate);
    }
  }

  public async run() {
    const exchangeInfo =
      BINANCE_MODE === 'spot'
        ? await binanceClient.exchangeInfo()
        : await binanceClient.futuresExchangeInfo();

    const symbol = this.tradeConfig.asset + this.tradeConfig.base;
    const loopInterval = this.tradeConfig.loopInterval;

    this.loadCandles(symbol, loopInterval).then((candles) => {
      for (let i = 0; i < candles.length; i++) {
        this.checkOpenOrders();
      }
    });
  }

  private tradeWithSpot(
    tradeConfig: TradeConfig,
    candles: ChartCandle[],
    exchangeInfo: ExchangeInfo
  ) {}

  private tradeWithFutures(
    tradeConfig: TradeConfig,
    candles: ChartCandle[],
    exchangeInfo: ExchangeInfo
  ) {}

  private checkOpenOrders() {}

  private loadCandles(symbol: string, interval: CandleChartInterval) {
    return new Promise<ChartCandle[]>((resolve, reject) => {
      const intervalString =
        interval === CandleChartInterval.ONE_MINUTE
          ? '1m'
          : interval === CandleChartInterval.FIVE_MINUTES
          ? '5m'
          : interval === CandleChartInterval.FIFTEEN_MINUTES
          ? '15m'
          : interval === CandleChartInterval.THIRTY_MINUTES
          ? '30m'
          : interval === CandleChartInterval.ONE_HOUR
          ? '1h'
          : interval === CandleChartInterval.TWO_HOURS
          ? '2h'
          : interval === CandleChartInterval.FOUR_HOURS
          ? '4h'
          : interval === CandleChartInterval.SIX_HOURS
          ? '6h'
          : interval === CandleChartInterval.TWELVE_HOURS
          ? '12h'
          : interval === CandleChartInterval.ONE_DAY
          ? '1d'
          : null;

      if (!intervalString) reject(`The time frame is not supported`);

      const file = path.join(
        process.cwd(),
        'data',
        symbol,
        `_${intervalString}.csv`
      );

      const candleData: CSVCandleData[] = [];
      const results: ChartCandle[] = [];

      fs.createReadStream(file)
        .pipe(csv({ separator: ',' }))
        .on('data', (data: CSVCandleData) => {
          candleData.push({
            date: new Date(data.date),
            open: Number(data.open),
            close: Number(data.close),
            high: Number(data.high),
            low: Number(data.low),
            volume: Number(data.volume),
          });
        })
        .on('end', () => {
          candleData.reverse();

          const startDateTimestamp = this.startDate.getTime();
          const endDateTimestamp = this.endDate.getTime();

          for (let i = 0; i < candleData.length; i++) {
            let timestamp = new Date(candleData[i].date).getTime();
            if (
              timestamp >= startDateTimestamp &&
              timestamp <= endDateTimestamp
            ) {
              results.push({
                open: candleData[i].open,
                close: candleData[i].close,
                high: candleData[i].high,
                low: candleData[i].low,
                volume: candleData[i].volume,
                date: candleData[i].date,
              });
            }
          }
          resolve(results);
        });
    });
  }

  private closeOpenOrders(symbol: string) {}
}
