import { CandleChartInterval } from 'binance-api-node';

type Memory = {
  [key: string]: { [date: string]: number };
};

export class Cache {
  private memory: Memory = {};

  createAllocation(symbol: string, timeFrame: CandleChartInterval) {
    let key = `${symbol}-${timeFrame}`;
    if (!this.memory[key]) {
      this.memory[key] = {};
    }
  }

  saveData(
    symbol: string,
    timeFrame: CandleChartInterval,
    dates: number[], // timestamps
    values: any[]
  ) {
    let key = `${symbol}-${timeFrame}`;
    if (!this.memory[key]) {
      this.createAllocation(symbol, timeFrame);
    }
    dates.forEach((date, i) => {
      this.memory[key][date] = values[i];
    });
  }

  getData(
    symbol: string,
    timeFrame: CandleChartInterval,
    indicatorName: string,
    index: number
  ) {
    let key = `${symbol}-${timeFrame}-${indicatorName}`;
    if (!this.memory[key][index]) {
      console.error(
        `There is no allocation memory for ${indicatorName} on ${symbol} ${timeFrame}`
      );
      return;
    }
    if (index >= 0 && index < this.memory[key].length) {
      return this.memory[key][index];
    } else {
      console.error(
        `The index memory for ${indicatorName} on ${symbol} ${timeFrame} doesn't exist: ${index}`
      );
    }
  }
}
