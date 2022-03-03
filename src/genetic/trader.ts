import dayjs from 'dayjs';
import { Binance, ExchangeInfo } from 'binance-api-node';
import { NeuralNetwork } from '../lib/neuralNetwork';
import { isValidQuantity } from '../utils/currencyInfo';
import { Counter } from '../tools/counter';
import { mutate } from './neat';
import { BotConfig } from '../init';
import {
  getOutputs,
  NUMBER_HIDDEN_NODES,
  NUMBER_INPUTS,
  NUMBER_OUTPUTS,
} from './neuralNetwork';
import { timeFrameToMinutes } from '../utils/timeFrame';

// ==================================================================

const TAKER_FEES = BotConfig['taker_fees_futures']; // %

// The trader start to trade when it has at least X candles on the chart
const MINIMAL_CANDLES_LENGTH = 100;

// ==================================================================

class Trader {
  private tradeConfig: TradeConfig;
  private binanceClient: Binance;
  private exchangeInfo: ExchangeInfo;
  private historicCandleData: CandleData[];
  private initialCapital: number;

  public wallet: FuturesWallet;

  private counter: Counter; // to cut the position too long

  // Stats
  public numberTrades: number; // used to calculate the number trade made per day
  public totalProfit: number;
  public totalLoss: number;
  public totalFees: number;
  public totalWinningTrades: number;
  public totalLostTrades: number;

  // Neat algorithm
  public brain: NeuralNetwork;
  public score: number;
  public fitness: number;

  constructor(
    tradeConfig: TradeConfig,
    historicCandleData: CandleData[],
    binanceClient: Binance,
    exchangeInfo: ExchangeInfo,
    initialCapital: number,
    brain?: NeuralNetwork
  ) {
    this.tradeConfig = tradeConfig;
    this.binanceClient = binanceClient;
    this.exchangeInfo = exchangeInfo;
    this.historicCandleData = historicCandleData;
    this.initialCapital = initialCapital;

    this.numberTrades = 0;
    this.totalProfit = 0;
    this.totalLoss = 0;
    this.totalFees = 0;
    this.totalWinningTrades = 0;
    this.totalLostTrades = 0;

    this.wallet = {
      availableBalance: initialCapital,
      totalWalletBalance: initialCapital,
      totalUnrealizedProfit: 0,
      positions: [
        {
          pair: this.tradeConfig.asset + this.tradeConfig.base,
          leverage: this.tradeConfig.leverage | 10,
          entryPrice: 0,
          margin: 0,
          positionSide: 'LONG',
          unrealizedProfit: 0,
          size: 0,
        },
      ],
    };

    if (brain instanceof NeuralNetwork) {
      this.brain = brain.copy();
      this.brain.mutate(mutate);
    } else {
      this.brain = new NeuralNetwork(
        NUMBER_INPUTS,
        NUMBER_HIDDEN_NODES,
        NUMBER_OUTPUTS
      );
    }

    this.score = 0;
    this.fitness = 0;
  }

  /**
   * Main function
   */
  public run() {
    const { asset, base, maxTradeDuration, loopInterval } = this.tradeConfig;

    // Counter will be use to fix the duration of the trades
    if (maxTradeDuration) this.counter = new Counter(maxTradeDuration);

    for (let i = 0; i < this.historicCandleData.length; i++) {
      if (i < MINIMAL_CANDLES_LENGTH) continue;

      let candles = this.historicCandleData.slice(
        i - MINIMAL_CANDLES_LENGTH < 0 ? 0 : i - MINIMAL_CANDLES_LENGTH,
        i
      );
      let currentPrice = candles[candles.length - 1].close;

      if (this.wallet.totalWalletBalance <= 0) {
        break;
      } else {
        this.checkPositionMargin(asset + base, currentPrice);
        this.trade(this.tradeConfig, currentPrice, candles, this.exchangeInfo);
      }
    }

    // Default calculation of the score
    this.score = this.evaluate();
  }

  /**
   * Main function to take a decision about the market
   */
  private trade(
    tradeConfig: TradeConfig,
    currentPrice: number,
    candles: CandleData[],
    exchangeInfo: ExchangeInfo
  ) {
    const { asset, base, risk, tradingSession, riskManagement } = tradeConfig;
    const pair = asset + base;

    // Balance information
    const totalBalance = this.wallet.totalWalletBalance;
    const availableBalance = this.wallet.availableBalance;

    // Position information
    const positions = this.wallet.positions;
    const position = positions.find((position) => position.pair === pair);
    const hasLongPosition = position.size > 0;
    const hasShortPosition = position.size < 0;

    // Check if we are in the trading sessions
    let isTradingSessionActive = this.isTradingSessionActive(
      candles[candles.length - 1].openTime,
      tradingSession
    );

    // The current position is too long ?
    if ((hasShortPosition || hasLongPosition) && this.counter) {
      this.counter.decrement();
      if (this.counter.getValue() == 0) {
        this.orderMarket(
          pair,
          currentPrice,
          Math.abs(position.size),
          hasLongPosition ? 'SELL' : 'BUY'
        );
        this.counter.reset();
        return;
      }
    }

    // Decision to take
    const isBuySignal =
      this.think(pair, candles) === 'BUY' && !hasShortPosition;
    const isSellSignal =
      this.think(pair, candles) === 'SELL' && !hasLongPosition;
    const closePosition =
      this.think(pair, candles) === 'CLOSE' &&
      (hasShortPosition || hasLongPosition);

    // Close the current position
    if (closePosition && (hasLongPosition || hasShortPosition)) {
      this.orderMarket(
        pair,
        currentPrice,
        Math.abs(position.size),
        hasLongPosition ? 'SELL' : 'BUY'
      );
      return;
    }

    if ((isTradingSessionActive || position.size !== 0) && isBuySignal) {
      // Calculation of the quantity for the position according to the risk management
      let quantity = riskManagement({
        asset,
        base,
        balance: Number(availableBalance),
        risk,
        enterPrice: currentPrice,
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

      this.orderMarket(pair, currentPrice, quantity, 'BUY');
    } else if (
      (isTradingSessionActive || position.size !== 0) &&
      isSellSignal
    ) {
      // Calculation of the quantity for the position according to the risk management
      let quantity = riskManagement({
        asset,
        base,
        balance: Number(availableBalance),
        risk,
        enterPrice: currentPrice,
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

      this.orderMarket(pair, currentPrice, quantity, 'SELL');
    }
  }

  /**
   * take a long or a short with a market order
   * @param pair
   * @param price
   * @param quantity
   * @param side
   */
  private orderMarket(
    pair: string,
    price: number,
    quantity: number,
    side: 'BUY' | 'SELL'
  ) {
    const wallet = this.wallet;
    const positions = wallet.positions;
    const position = positions.find((pos) => pos.pair === pair);
    const { entryPrice, size, leverage } = position;
    const fees = price * quantity * (TAKER_FEES / 100);
    const hadPosition = position.size !== 0;

    if (side === 'BUY') {
      if (position.positionSide === 'LONG') {
        let baseCost = (price * quantity) / leverage;
        // If there is enough available base currency
        if (wallet.availableBalance >= baseCost + fees) {
          let avgEntryPrice =
            (price * quantity + entryPrice * Math.abs(size)) /
            (quantity + Math.abs(size));

          position.margin += baseCost;
          position.size += quantity;
          position.entryPrice = avgEntryPrice;

          wallet.availableBalance -= baseCost + fees;
          wallet.totalWalletBalance -= fees;

          if (!hadPosition) this.numberTrades++;
          this.totalFees += fees;
        }
      } else if (position.positionSide === 'SHORT') {
        // Update wallet
        let pnl = this.getPositionPNL(position, price);
        wallet.availableBalance += position.margin + pnl - fees;
        wallet.totalWalletBalance += pnl - fees;
        this.totalFees += fees;

        // Update profit and loss
        if (pnl >= 0) {
          this.totalProfit += pnl;
        } else {
          this.totalLoss += pnl;
        }

        // Update position
        position.size += quantity;
        position.margin = Math.abs(position.size * price) / leverage;

        // The position has been closed
        if (position.size === 0) {
          position.entryPrice = 0;
          position.unrealizedProfit = 0;
        }

        // The order changes the position side of the current position
        if (position.size > 0) {
          position.entryPrice = price;
          position.positionSide = 'LONG';
          let newPnl = this.getPositionPNL(position, price);
          position.unrealizedProfit = newPnl;
          wallet.availableBalance -= position.margin;
        }

        if (hadPosition && entryPrice >= price) this.totalWinningTrades++;
        if (hadPosition && entryPrice < price) this.totalLostTrades++;
      }
    } else if (side === 'SELL') {
      let baseCost = (price * quantity) / leverage;

      if (position.positionSide === 'SHORT') {
        // If there is enough available base currency
        if (wallet.availableBalance >= baseCost + fees) {
          let avgEntryPrice =
            (price * quantity + entryPrice * Math.abs(size)) /
            (quantity + Math.abs(size));

          position.margin += baseCost;
          position.size -= quantity;
          position.entryPrice = avgEntryPrice;

          wallet.availableBalance -= baseCost + fees;
          wallet.totalWalletBalance -= fees;

          if (!hadPosition) this.numberTrades++;
          this.totalFees += fees;
        }
      } else if (position.positionSide === 'LONG') {
        // Update wallet
        let pnl = this.getPositionPNL(position, price);
        wallet.availableBalance += position.margin + pnl - fees;
        wallet.totalWalletBalance += pnl - fees;
        this.totalFees += fees;

        // Update profit and loss
        if (pnl >= 0) {
          this.totalProfit += pnl;
        } else {
          this.totalLoss += pnl;
        }

        // Update position
        position.size -= quantity;
        position.margin = Math.abs(position.size * price) / leverage;

        // The position has been closed
        if (position.size === 0) {
          position.entryPrice = 0;
          position.unrealizedProfit = 0;
        }

        // The order changes the position side of the current order
        if (position.size < 0) {
          position.entryPrice = price;
          position.positionSide = 'SHORT';
          let newPnl = this.getPositionPNL(position, price);
          position.unrealizedProfit = newPnl;
          wallet.availableBalance -= position.margin;
        }

        if (hadPosition && entryPrice <= price) this.totalWinningTrades++;
        if (hadPosition && entryPrice > price) this.totalLostTrades++;
      }
    }
  }

  /**
   * Check if the margin is enough to maintain the position. If not, the position is liquidated
   * @param pair
   * @param currentPrice
   */
  private checkPositionMargin(pair: string, currentPrice: number) {
    const position = this.wallet.positions.find((pos) => pos.pair === pair);
    const { margin, unrealizedProfit, size, positionSide } = position;

    if (margin + unrealizedProfit <= 0) {
      this.orderMarket(
        pair,
        currentPrice,
        size,
        positionSide === 'LONG' ? 'SELL' : 'BUY'
      );
    }
  }

  /**
   * Get the unrealized profit ofa position
   * @param position
   * @param currentPrice
   */
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

  /**
   * The trader trade only on the trading session authorized
   * @param currentDate
   * @param tradingSession
   */
  private isTradingSessionActive(
    currentDate: Date,
    tradingSession?: TradingSession
  ) {
    if (tradingSession) {
      const currentTime = dayjs(currentDate);
      const currentDay = currentTime.format('YYYY-MM-DD');
      const startSessionTime = `${currentDay} ${tradingSession.start}:00`;
      const endSessionTime = `${currentDay} ${tradingSession.end}:00`;
      return dayjs(currentTime.format('YYYY-MM-DD HH:mm:ss')).isBetween(
        startSessionTime,
        endSessionTime
      );
    } else {
      return true;
    }
  }

  /**
   * Search an action from the neural network
   * @param pair
   * @param candles
   */
  private think(pair: string, candles: CandleData[]) {
    return getOutputs(pair, candles, this.brain, {
      futuresWallet: this.wallet,
    });
  }

  /**
   * Return a new trader with the same attributes
   */
  public copy() {
    return new Trader(
      this.tradeConfig,
      this.historicCandleData,
      this.binanceClient,
      this.exchangeInfo,
      this.initialCapital,
      this.brain
    );
  }

  /**
   * Evaluate the score of the trader
   */
  private evaluate() {
    const totalDays = Math.round(
      (timeFrameToMinutes(this.tradeConfig.loopInterval) *
        this.historicCandleData.length) /
        1440
    );
    const minimumTrades = totalDays * 1.5;
    const maximumTrades = totalDays * 3;

    if (this.numberTrades < minimumTrades || this.numberTrades > maximumTrades)
      return 0;

    if (this.totalProfit < this.totalLoss) return 0;

    let profitRatio =
      this.totalProfit / (Math.abs(this.totalLoss) + this.totalFees);
    let totalNetProfit =
      this.totalProfit - (Math.abs(this.totalLoss) + this.totalFees);
    let winRate = this.totalWinningTrades / this.numberTrades;

    return Math.round(
      (totalNetProfit * profitRatio * winRate * this.numberTrades) / 100
    );
  }
}

export default Trader;
