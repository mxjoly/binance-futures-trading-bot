import { CandleChartInterval } from 'binance-api-node';

type Memory = {
  [key: string]: { [date: string]: number };
};

export class Cache {
  private memory: Memory = {};

  public createKey(
    symbol: string,
    timeFrame: CandleChartInterval,
    optionsHash: string
  ) {
    let key = `${symbol}-${timeFrame}-${optionsHash}`;
    if (!this.memory[key]) {
      this.memory[key] = {};
    }
  }

  /**
   * Save a value to the cache by using the date of the candle as index
   * @param symbol
   * @param timeFrame
   * @param optionsHash
   * @param date
   * @param value
   */
  public saveValue(
    symbol: string,
    timeFrame: CandleChartInterval,
    optionsHash: string, // The options used in hash
    date: number, // timestamp
    value: any
  ) {
    let key = `${symbol}-${timeFrame}-${optionsHash}`;
    if (!this.memory[key]) {
      this.createKey(symbol, timeFrame, optionsHash);
    }
    this.memory[key][date] = value;
  }

  /**
   * Save indicator values
   * @param symbol
   * @param timeFrame
   * @param values
   * @param dates
   * @param optionsHash
   * @returns
   */
  public saveValues(
    symbol: string,
    timeFrame: CandleChartInterval,
    values: any[],
    dates: number[],
    optionsHash: string
  ) {
    if (values.length !== dates.length) {
      console.error(
        `Error of length when trying to cache the values for ${symbol} on ${timeFrame}`
      );
      return;
    }

    for (let i = 0; i < values.length; i++) {
      if (!this.get(symbol, timeFrame, optionsHash, dates[i])) {
        this.saveValue(symbol, timeFrame, optionsHash, dates[i], values[i]);
      }
    }
  }

  /**
   * Check the existence of the values on a timeFrame with a specific config
   * @param symbol
   * @param timeFrame
   * @param optionsHash
   */
  public exist(
    symbol: string,
    timeFrame: CandleChartInterval,
    optionsHash: string
  ) {
    let key = `${symbol}-${timeFrame}-${optionsHash}`;
    return this.memory[key] ? true : false;
  }

  /**
   * Get the value at a specified date
   * @param symbol
   * @param timeFrame
   * @param optionsHash
   * @param date
   */
  public get(
    symbol: string,
    timeFrame: CandleChartInterval,
    optionsHash: string,
    date: number // Timestamp
  ) {
    let key = `${symbol}-${timeFrame}-${optionsHash}`;
    if (!this.memory[key] || !this.memory[key][date]) {
      return null;
    }
    return this.memory[key][date];
  }
}
