import safeRequire from 'safe-require';
import dayjs from 'dayjs';
import { Binance, ExchangeInfo } from 'binance-api-node';
import { NeuralNetwork } from '../lib/neuralNetwork';
import { isValidQuantity } from '../utils/currencyInfo';
import { randomGaussian } from '../utils/math';
import { getOutputs } from '.';
import { Counter } from '../tools/counter';
import { timeFrameToMinutes } from '../utils/timeFrame';

// ==================================================================

const BotConfig = safeRequire(`${process.cwd()}/config.json`);

if (!BotConfig) {
  console.error(
    'Something is wrong. No json config file has been found at the root of the project.'
  );
  process.exit(1);
}

const BacktestConfig = BotConfig['backtest'];

const TAKER_FEES = BacktestConfig['taker_fees_futures']; // %

// ==================================================================

function mutate(x: number) {
  if (Math.random() < 0.1) {
    let offset = randomGaussian() * 0.5;
    let newx = x + offset;
    return newx;
  } else {
    return x;
  }
}

// ==================================================================

class Trader {
  private tradeConfig: TradeConfig;
  private binanceClient: Binance;
  private exchangeInfo: ExchangeInfo;
  private historicCandleData: CandleData[];
  private initialCapital: number;

  public wallet: FuturesWallet;
  private openOrders: FuturesOpenOrder[];

  private counter: Counter; // to cut the position too long

  // Stats
  public numberTrades: number;
  public totalProfit: number;
  public totalLoss: number;

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

    this.counter = new Counter(0);

    this.numberTrades = 0;
    this.totalProfit = 0;
    this.totalLoss = 0;

    this.openOrders = [];
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
      this.brain = new NeuralNetwork(4, 8, 3);
    }

    this.score = 0;
    this.fitness = 0;
  }

  public run() {
    const { asset, base } = this.tradeConfig;

    for (let i = 0; i < this.historicCandleData.length; i++) {
      if (i < 50) continue;

      let candles = this.historicCandleData.slice(0, i);
      let currentPrice = candles[candles.length - 1].close;

      if (this.wallet.totalWalletBalance <= this.initialCapital * 0.8) {
        this.score = -this.initialCapital;
        break;
      } else {
        this.checkPositionMargin(asset + base, currentPrice);
        this.trade(this.tradeConfig, currentPrice, candles, this.exchangeInfo);
      }
    }

    // Default calculation of the score
    this.score += Math.abs(this.totalProfit) - Math.abs(this.totalLoss);
  }

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

    // The current position is too long
    if (hasShortPosition || hasLongPosition) {
      this.counter.increment();
      if (this.counter.getValue() >= tradeConfig.maxTradeDuration) {
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

    const isBuySignal = this.think(pair, candles) === 'BUY';
    const isSellSignal = this.think(pair, candles) === 'SELL';
    const closePosition = this.think(pair, candles) === 'CLOSE';

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

    if (position.size === 0) {
      this.numberTrades++;
    }

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
        }
      } else if (position.positionSide === 'SHORT') {
        // Update wallet
        let pnl = this.getPositionPNL(position, price);
        wallet.availableBalance += position.margin + pnl - fees;
        wallet.totalWalletBalance += pnl - fees;

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
        }
      } else if (position.positionSide === 'LONG') {
        // Update wallet
        let pnl = this.getPositionPNL(position, price);
        wallet.availableBalance += position.margin + pnl - fees;
        wallet.totalWalletBalance += pnl - fees;

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
      }
    }
  }

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

  private think(pair: string, candles: CandleData[]) {
    return getOutputs(pair, candles, this.brain, {
      futuresWallet: this.wallet,
    });
  }

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
}

export default Trader;
