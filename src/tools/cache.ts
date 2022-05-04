import { CandleChartInterval } from 'binance-api-node';

type Memory = {
  [key: string]: { [date: string]: number };
};

export class Cache {
  private memory: Memory = {};

  private createAllocation(
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
  public save(
    symbol: string,
    timeFrame: CandleChartInterval,
    optionsHash: string, // The options used in hash
    date: number, // timestamp
    value: any
  ) {
    let key = `${symbol}-${timeFrame}-${optionsHash}`;
    if (!this.memory[key]) {
      this.createAllocation(symbol, timeFrame, optionsHash);
    }
    this.memory[key][date] = value;
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
    if (date >= 0 && date < this.memory[key].length) {
      return this.memory[key][date];
    } else {
      return null;
    }
  }
}
