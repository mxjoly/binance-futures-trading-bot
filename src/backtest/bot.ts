import fs from 'fs';
import path from 'path';
import csv from 'csv-parser';
import { CandleChartInterval } from 'binance-api-node';
import { binanceClient } from '.';

// ====================================================================== //

// The bot will trade with the binance :
export const BINANCE_MODE: BinanceMode = 'futures';

export class Bot {
  private tradeConfig: TradeConfig;
  private startDate: Date;
  private endDate: Date;

  constructor(tradeConfigs: TradeConfig[], startDate: Date, endDate: Date) {
    this.tradeConfig = tradeConfigs[0];
    this.startDate = startDate;
    this.endDate = endDate;
  }

  public async run() {
    const exchangeInfo =
      BINANCE_MODE === 'spot'
        ? await binanceClient.exchangeInfo()
        : await binanceClient.futuresExchangeInfo();

    const symbol = this.tradeConfig.asset + this.tradeConfig.base;
    const loopInterval = this.tradeConfig.loopInterval;

    this.loadCandles(symbol, loopInterval).then((candles) => {
      for (let i = 0; i < candles.length; i++) {}
    });
  }

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

      const candleData: CandleData[] = [];
      const results: ChartCandle[] = [];

      fs.createReadStream(file)
        .pipe(csv({ separator: ',' }))
        .on('data', (data: CandleData) => {
          candleData.push({
            date: data.date,
            open: data.open,
            close: data.close,
            high: data.high,
            low: data.low,
            volume: data.volume,
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
              });
            }
          }
          resolve(results);
        });
    });
  }

  private closeOpenOrders(symbol: string) {}
}
