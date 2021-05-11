interface TradeConfig {
  mode: 'spot' | 'futures';
  asset: string;
  base: string;
  allocation: number; // between 0 and 1
  lossTolerance: number; // between 0 and 1
  profitTarget?: number; // between 0 and 1
  period: number;
  interval: CandleChartInterval;
  leverage?: number;
}
