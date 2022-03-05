interface TraderStats {
  totalProfit: number;
  totalLoss: number;
  totalFees: number;
  totalTrades: number; // used to calculate the number trade made per day
  winningTrades: number;
  lostTrades: number;
  longTrades: number;
  shortTrades: number;
  longWinningTrades: number;
  longLostTrades: number;
  shortWinningTrades: number;
  shortLostTrades: number;
  maxBalance: number;
  maxRelativeDrawdown: number;
}
