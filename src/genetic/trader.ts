import dayjs from 'dayjs';
import { Binance, ExchangeInfo, OrderSide } from 'binance-api-node';
import { NeuralNetwork } from '../lib/neuralNetwork';
import {
  getPricePrecision,
  getQuantityPrecision,
  isValidQuantity,
} from '../utils/currencyInfo';
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
const MAKER_FEES = BotConfig['maker_fees_futures']; // %

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
  private openOrders: FuturesOpenOrder[];

  private counter: Counter; // to cut the position too long

  // Stats
  public totalProfit: number;
  public totalLoss: number;
  public totalFees: number;
  public totalTrades: number; // used to calculate the number trade made per day
  public winningTrades: number;
  public lostTrades: number;
  public longTrades: number;
  public shortTrades: number;
  public longWinningTrades: number;
  public longLostTrades: number;
  public shortWinningTrades: number;
  public shortLostTrades: number;

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

    this.totalTrades = 0;
    this.totalProfit = 0;
    this.totalLoss = 0;
    this.totalFees = 0;
    this.winningTrades = 0;
    this.lostTrades = 0;
    this.longTrades = 0;
    this.shortTrades = 0;
    this.longWinningTrades = 0;
    this.longLostTrades = 0;
    this.shortWinningTrades = 0;
    this.shortLostTrades = 0;

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
      // If the trade config doesn't have an exit strategy, we add to the inputs of network an information to inform if it currently
      // have an opened position, and we add an output to close or not the position
      this.brain = new NeuralNetwork(
        this.tradeConfig.exitStrategy ? NUMBER_INPUTS : NUMBER_INPUTS + 1,
        this.tradeConfig.exitStrategy
          ? NUMBER_HIDDEN_NODES
          : NUMBER_HIDDEN_NODES + 1,
        this.tradeConfig.exitStrategy ? NUMBER_OUTPUTS : NUMBER_OUTPUTS + 1
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

      if (this.wallet.totalWalletBalance <= this.initialCapital * 0.9) {
        break;
      } else {
        this.checkPositionMargin(asset + base, currentPrice);
        this.checkFuturesOpenOrders(asset, base, candles);
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
    const { asset, base, risk, tradingSession, riskManagement, exitStrategy } =
      tradeConfig;
    const pair = asset + base;

    // Balance information
    const totalBalance = this.wallet.totalWalletBalance;
    const availableBalance = this.wallet.availableBalance;

    // Position information
    const positions = this.wallet.positions;
    const position = positions.find((position) => position.pair === pair);
    const hasLongPosition = position.size > 0;
    const hasShortPosition = position.size < 0;

    // Conditions to take or not a position
    const canTakeLongPosition = !hasLongPosition;
    const canTakeShortPosition = !hasShortPosition;

    // Currency infos
    const pricePrecision = getPricePrecision(pair, exchangeInfo);
    const quantityPrecision = getQuantityPrecision(pair, exchangeInfo);

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
    const closePosition = exitStrategy
      ? false
      : this.think(pair, candles) === 'CLOSE' &&
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

    if (
      (isTradingSessionActive || position.size !== 0) &&
      canTakeLongPosition &&
      isBuySignal
    ) {
      // Calculate TP and SL
      let { takeProfits, stopLoss } = exitStrategy
        ? exitStrategy(currentPrice, candles, pricePrecision, OrderSide.BUY)
        : { takeProfits: [], stopLoss: null };

      // Calculation of the quantity for the position according to the risk management
      let quantity = riskManagement({
        asset,
        base,
        balance: Number(availableBalance),
        risk,
        enterPrice: currentPrice,
        stopLossPrice: stopLoss,
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

      if (takeProfits.length > 0) {
        // Create the take profit orders
        takeProfits.forEach(({ price, quantityPercentage }) => {
          this.orderLimit(
            pair,
            price,
            Math.abs(position.size) * quantityPercentage,
            'SHORT'
          );
        });
      }

      if (stopLoss) {
        this.orderLimit(pair, stopLoss, Math.abs(position.size), 'SHORT');
      }
    } else if (
      (isTradingSessionActive || position.size !== 0) &&
      canTakeShortPosition &&
      isSellSignal
    ) {
      // Calculate TP and SL
      let { takeProfits, stopLoss } = exitStrategy
        ? exitStrategy(currentPrice, candles, pricePrecision, OrderSide.SELL)
        : { takeProfits: [], stopLoss: null };

      // Calculation of the quantity for the position according to the risk management
      let quantity = riskManagement({
        asset,
        base,
        balance: Number(availableBalance),
        risk,
        enterPrice: currentPrice,
        stopLossPrice: stopLoss,
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

      if (takeProfits.length > 0) {
        // Create the take profit orders
        takeProfits.forEach(({ price, quantityPercentage }) => {
          this.orderLimit(
            pair,
            price,
            Math.abs(position.size) * quantityPercentage,
            'LONG'
          );
        });
      }

      if (stopLoss) {
        this.orderLimit(pair, stopLoss, Math.abs(position.size), 'LONG');
      }
    }
  }

  /**
   * Check the futures open orders based on the current price. If the price crosses an order, this latter is activated.
   * @param asset
   * @param base
   * @param candles
   */
  private checkFuturesOpenOrders(
    asset: string,
    base: string,
    candles: CandleData[]
  ) {
    const lastCandle = candles[candles.length - 1];

    if (this.openOrders.length > 0) {
      const pair = asset + base;
      const pairOrders = this.openOrders.filter((order) => order.pair === pair);
      const longOrders = pairOrders.filter(
        (order) => order.positionSide === 'LONG'
      );
      const shortOrders = pairOrders.filter(
        (order) => order.positionSide === 'SHORT'
      );
      const position = this.wallet.positions.find(
        (position) => position.pair === pair
      );

      // Prevent remaining open orders when all the take profit or a stop loss has been filled
      if (position.size === 0 && this.openOrders.length > 0) {
        this.closeFuturesOpenOrders(pair);
      }

      // Check if a long order has been activated on the last candle
      longOrders
        .sort((order1, order2) => order2.price - order1.price) // sort order from nearest price to furthest price
        .every(({ id, price, quantity, type }) => {
          const { entryPrice, size, leverage } = position;
          const fees = quantity * price * (MAKER_FEES / 100);

          // Price crossed the buy limit order
          if (lastCandle.high > price && lastCandle.low < price) {
            if (type === 'LIMIT') {
              // Average the position
              if (position.positionSide === 'LONG') {
                let baseCost = (price * quantity) / leverage;

                // If there is enough available base
                if (this.wallet.availableBalance >= baseCost + fees) {
                  let avgEntryPrice =
                    (price * quantity + entryPrice * Math.abs(size)) /
                    (quantity + Math.abs(size));

                  position.margin += baseCost;
                  position.size += quantity;
                  position.entryPrice = avgEntryPrice;
                  this.wallet.availableBalance -= baseCost + fees;
                  this.wallet.totalWalletBalance -= fees;

                  this.totalTrades++;
                  this.longTrades++;
                  this.totalFees += fees;
                }
              } else if (position.positionSide === 'SHORT') {
                let hasPosition = position.size < 0;

                // Update wallet
                let pnl = this.getPositionPNL(position, price);
                this.wallet.availableBalance += position.margin + pnl - fees;
                this.wallet.totalWalletBalance += pnl - fees;

                // Update position
                position.size += quantity;
                position.margin = Math.abs(position.size * price) / leverage;

                // The position has been closed
                if (position.size === 0) {
                  position.entryPrice = 0;
                  position.unrealizedProfit = 0;
                }

                // The position side has been changed
                if (position.size > 0) {
                  position.entryPrice = price;
                  position.positionSide = 'LONG';
                  let newPnl = this.getPositionPNL(position, price);
                  position.unrealizedProfit = newPnl;
                  this.wallet.availableBalance -= position.margin;
                  this.totalTrades++;
                  this.longTrades++;
                }

                // Update profit and loss
                if (pnl >= 0) {
                  this.totalProfit += pnl;
                  this.winningTrades++;
                } else {
                  this.totalLoss += pnl;
                  this.lostTrades++;
                }

                if (hasPosition && entryPrice >= price)
                  this.shortWinningTrades++;
                if (hasPosition && entryPrice < price) this.shortLostTrades++;
                this.totalFees += fees;
              }

              this.closeOpenOrder(id);
            }
          }

          // If an order close the position, do not continue to check the other orders.
          // Prevent to have multiple orders touches at the same time
          if (position.size === 0) {
            this.closeFuturesOpenOrders(pair);
            return false;
          } else {
            return true;
          }
        });

      shortOrders
        .sort((order1, order2) => order1.price - order2.price) // sort order from nearest price to furthest price
        .every(({ id, price, quantity, type }) => {
          const { entryPrice, size, leverage } = position;
          const fees = quantity * price * (MAKER_FEES / 100);

          // Price crossed the sell limit order
          if (lastCandle.high > price && lastCandle.low < price) {
            // If there is enough available base
            if (type === 'LIMIT') {
              // Average the position
              if (position.positionSide === 'SHORT') {
                let baseCost = (price * quantity) / leverage;

                // If there is enough available base
                if (this.wallet.availableBalance >= baseCost + fees) {
                  let avgEntryPrice =
                    (price * quantity + entryPrice * Math.abs(size)) /
                    (quantity + Math.abs(size));

                  position.margin += baseCost;
                  position.size -= quantity;
                  position.entryPrice = avgEntryPrice;
                  this.wallet.availableBalance -= baseCost + fees;
                  this.wallet.totalWalletBalance -= fees;

                  this.totalTrades++;
                  this.shortTrades++;
                  this.totalFees += fees;
                }
              } else if (position.positionSide === 'LONG') {
                let hasPosition = position.size > 0;

                // Update wallet
                let pnl = this.getPositionPNL(position, price);
                this.wallet.availableBalance += position.margin + pnl - fees;
                this.wallet.totalWalletBalance += pnl - fees;

                // Update position
                position.size -= quantity;
                position.margin = Math.abs(position.size * price) / leverage;

                // The position has been closed
                if (position.size === 0) {
                  position.entryPrice = 0;
                  position.unrealizedProfit = 0;
                }

                // The position side has been changed
                if (position.size < 0) {
                  position.entryPrice = price;
                  position.positionSide = 'SHORT';
                  let newPnl = this.getPositionPNL(position, price);
                  position.unrealizedProfit = newPnl;
                  this.wallet.availableBalance -= position.margin;
                  this.totalTrades++;
                  this.shortTrades++;
                }

                // Update profit and loss
                if (pnl >= 0) {
                  this.totalProfit += pnl;
                  this.winningTrades++;
                } else {
                  this.totalLoss += pnl;
                  this.lostTrades++;
                }

                if (hasPosition && entryPrice <= price)
                  this.longWinningTrades++;
                if (hasPosition && entryPrice > price) this.longLostTrades++;
                this.totalFees += fees;
              }

              this.closeOpenOrder(id);
            }
          }

          // If an order close the position, do not continue to check the other orders.
          // Prevent to have multiple orders touches at the same time
          if (position.size === 0) {
            this.closeFuturesOpenOrders(pair);
            return false;
          } else {
            return true;
          }
        });
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
    const hasPosition = position.size !== 0;

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

          if (!hasPosition) {
            this.totalTrades++;
            this.longTrades++;
          }
          this.totalFees += fees;
        }
      } else if (position.positionSide === 'SHORT') {
        // Update wallet
        let pnl = this.getPositionPNL(position, price);
        wallet.availableBalance += position.margin + pnl - fees;
        wallet.totalWalletBalance += pnl - fees;
        this.totalFees += fees;

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
          this.totalTrades++;
          this.longTrades++;
        }

        // Update profit and loss
        if (pnl >= 0) {
          this.totalProfit += pnl;
        } else {
          this.totalLoss += pnl;
        }

        if (hasPosition && entryPrice >= price) {
          this.winningTrades++;
          this.shortWinningTrades++;
        }
        if (hasPosition && entryPrice < price) {
          this.lostTrades++;
          this.shortLostTrades++;
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

          if (!hasPosition) {
            this.totalTrades++;
            this.shortTrades++;
          }
          this.totalFees += fees;
        }
      } else if (position.positionSide === 'LONG') {
        // Update wallet
        let pnl = this.getPositionPNL(position, price);
        wallet.availableBalance += position.margin + pnl - fees;
        wallet.totalWalletBalance += pnl - fees;
        this.totalFees += fees;

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
          this.totalTrades++;
          this.shortTrades++;
        }

        // Update profit and loss
        if (pnl >= 0) {
          this.totalProfit += pnl;
        } else {
          this.totalLoss += pnl;
        }

        if (hasPosition && entryPrice <= price) {
          this.winningTrades++;
          this.longWinningTrades++;
        }
        if (hasPosition && entryPrice > price) {
          this.lostTrades++;
          this.longLostTrades++;
        }
      }
    }
  }

  /**
   * Place a limit order
   * @param pair
   * @param price
   * @param quantity
   * @param positionSide
   */
  private orderLimit(
    pair: string,
    price: number,
    quantity: number,
    positionSide: 'LONG' | 'SHORT'
  ) {
    const position = this.wallet.positions.find((pos) => pos.pair === pair);

    if (quantity < 0) {
      console.error(
        `Cannot placed the limit order for ${pair}. The quantity is malformed: ${quantity}`
      );
      return;
    }

    let baseCost =
      Math.abs(price * quantity) / position.leverage - position.margin;
    let canOrder = this.wallet.availableBalance >= baseCost;

    if (canOrder) {
      let order: FuturesOpenOrder = {
        id: Math.random().toString(16).slice(2),
        pair,
        type: 'LIMIT',
        positionSide,
        price,
        quantity,
      };
      this.openOrders.push(order);
    } else {
      console.error(
        `Limit order for the pair ${pair} cannot be placed. quantity=${quantity} price=${price}`
      );
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
   *  Close an open order by its id
   * @param orderId The id of the order to close
   */
  private closeOpenOrder(orderId: string) {
    this.openOrders = this.openOrders.filter((order) => order.id !== orderId);
  }

  /**
   * Close all the open orders for a given pair
   * @param pair
   */
  private closeFuturesOpenOrders(pair: string) {
    this.openOrders = this.openOrders.filter((order) => order.pair !== pair);
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
    return getOutputs(
      pair,
      candles,
      this.brain,
      {
        futuresWallet: this.wallet,
      },
      this.tradeConfig.exitStrategy ? true : false
    );
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
    const maximumTrades = totalDays * 4;

    if (this.totalTrades < minimumTrades || this.totalTrades > maximumTrades)
      return 0;

    if (this.totalProfit < this.totalLoss) return 0;

    let profitRatio =
      this.totalProfit / (Math.abs(this.totalLoss) + this.totalFees);
    let totalNetProfit =
      this.totalProfit - (Math.abs(this.totalLoss) + this.totalFees);
    let winRate = this.winningTrades / this.totalTrades;

    // let score = totalNetProfit;
    // score *= winRate;
    // score *= profitRatio;
    // return score;

    return winRate * profitRatio;
  }
}

export default Trader;
