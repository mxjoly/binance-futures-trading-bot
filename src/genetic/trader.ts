import dayjs from 'dayjs';
import { Binance, ExchangeInfo, OrderSide } from 'binance-api-node';
import { NeuralNetwork } from '../lib/neuralNetwork';
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
import { calculateActivationPrice } from '../utils/trailingStop';
import {
  getPricePrecision,
  getQuantityPrecision,
  isValidQuantity,
} from '../utils/currencyInfo';

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
  public stats: TraderStats;

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

    this.stats = {
      totalTrades: 0,
      totalProfit: 0,
      totalLoss: 0,
      totalFees: 0,
      winningTrades: 0,
      lostTrades: 0,
      longTrades: 0,
      shortTrades: 0,
      longWinningTrades: 0,
      longLostTrades: 0,
      shortWinningTrades: 0,
      shortLostTrades: 0,
      maxBalance: initialCapital,
      maxRelativeDrawdown: 0,
    };

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

      if (this.wallet.totalWalletBalance <= 0) {
        break;
      } else {
        this.checkPositionMargin(asset + base, currentPrice);
        this.checkFuturesOpenOrders(asset, base, candles);
        this.trade(this.tradeConfig, currentPrice, candles, this.exchangeInfo);
      }

      // Update the max drawdown and max balance property for the strategy report
      this.updateDrawdownMaxBalance();
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
    const {
      asset,
      base,
      risk,
      allowPyramiding,
      maxPyramidingAllocation,
      tradingSession,
      riskManagement,
      exitStrategy,
      trendFilter,
      unidirectional,
      trailingStopConfig,
    } = tradeConfig;
    const pair = asset + base;

    // Check the trend
    const useLongPosition = trendFilter ? trendFilter(candles) === 1 : true;
    const useShortPosition = trendFilter ? trendFilter(candles) === -1 : true;

    // Balance information
    const assetBalance = this.wallet.totalWalletBalance;
    const availableBalance = this.wallet.availableBalance;

    // Position information
    const positions = this.wallet.positions;
    const position = positions.find((position) => position.pair === pair);
    const hasLongPosition = position.size > 0;
    const hasShortPosition = position.size < 0;

    // Conditions to take or not a position
    const canAddToPosition = allowPyramiding
      ? position.margin + assetBalance * risk <=
        assetBalance * maxPyramidingAllocation
      : false;
    const canTakeLongPosition =
      (!allowPyramiding && !hasLongPosition) || allowPyramiding;
    const canTakeShortPosition =
      (!allowPyramiding && !hasShortPosition) || allowPyramiding;

    // Open orders
    const currentOpenOrders = this.openOrders.filter(
      (order) => order.pair === pair
    );

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

    if (
      (isTradingSessionActive || position.size !== 0) &&
      (allowPyramiding || currentOpenOrders.length === 0) &&
      canTakeLongPosition &&
      isBuySignal
    ) {
      // Take the profit and not open a new position
      if (hasShortPosition && unidirectional) {
        this.orderMarket(pair, currentPrice, Math.abs(position.size), 'BUY');
        this.closeFuturesOpenOrders(pair);
        return;
      }

      // Do not trade with long position if the trend is down
      if (!useLongPosition) return;

      // Do not add to the current position if the allocation is over the max allocation
      if (allowPyramiding && hasLongPosition && !canAddToPosition) return;

      // Do not close the current short position built progressively in pyramiding mode
      if (allowPyramiding && hasShortPosition) return;

      // Do not buy now if a take profit is already set on the last short position
      let hasTakeProfits = currentOpenOrders.some(
        (order) => order.price < position.entryPrice
      );
      if (hasShortPosition && hasTakeProfits) return;

      // Calculate TP and SL
      let { takeProfits, stopLoss } = exitStrategy
        ? exitStrategy(currentPrice, candles, pricePrecision, OrderSide.BUY)
        : { takeProfits: [], stopLoss: null };

      // Calculation of the quantity for the position according to the risk management
      let quantity = riskManagement({
        asset,
        base,
        balance: allowPyramiding
          ? Number(assetBalance)
          : Number(availableBalance),
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

      // Cancel the previous orders to update them
      if (currentOpenOrders.length > 0) {
        this.closeFuturesOpenOrders(pair);
      }

      // In pyramiding mode, update the take profits and stop loss
      if (allowPyramiding && hasLongPosition) {
        let { takeProfits: updatedTakeProfits, stopLoss: updatedStopLoss } =
          exitStrategy
            ? exitStrategy(
                position.entryPrice,
                candles,
                pricePrecision,
                OrderSide.BUY
              )
            : { takeProfits: [], stopLoss: null };
        takeProfits = updatedTakeProfits;
        stopLoss = updatedStopLoss;
      }

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

      if (trailingStopConfig) {
        let activationPrice = calculateActivationPrice(
          trailingStopConfig,
          position.entryPrice,
          pricePrecision,
          takeProfits
        );

        this.orderTrailingStop(
          asset,
          base,
          activationPrice,
          Math.abs(position.size),
          'SHORT',
          trailingStopConfig
        );
      }
    } else if (
      (isTradingSessionActive || position.size !== 0) &&
      (allowPyramiding || currentOpenOrders.length === 0) &&
      canTakeShortPosition &&
      isSellSignal
    ) {
      // Take the profit and not open a new position
      if (hasLongPosition && unidirectional) {
        this.orderMarket(pair, currentPrice, Math.abs(position.size), 'SELL');
        this.closeFuturesOpenOrders(pair);
        return;
      }

      // Do not trade with short position if the trend is up
      if (!useShortPosition) return;

      // Do not add to the current position if the allocation is over the max allocation
      if (allowPyramiding && hasShortPosition && !canAddToPosition) return;

      // Do not close the current long position built progressively in pyramiding mode
      if (allowPyramiding && hasLongPosition) return;

      // Do not sell now if a take profit is already set on the last long position
      let hasTakeProfits = currentOpenOrders.some(
        (order) => order.price > position.entryPrice
      );
      if (hasLongPosition && hasTakeProfits) return;

      // Calculate TP and SL
      let { takeProfits, stopLoss } = exitStrategy
        ? exitStrategy(currentPrice, candles, pricePrecision, OrderSide.SELL)
        : { takeProfits: [], stopLoss: null };

      // Calculation of the quantity for the position according to the risk management
      let quantity = riskManagement({
        asset,
        base,
        balance: allowPyramiding
          ? Number(assetBalance)
          : Number(availableBalance),
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

      // Cancel the previous orders to update them
      if (currentOpenOrders.length > 0) {
        this.closeFuturesOpenOrders(pair);
      }

      // In pyramiding mode, update the take profits and stop loss
      if (allowPyramiding && hasLongPosition) {
        let { takeProfits: updatedTakeProfits, stopLoss: updatedStopLoss } =
          exitStrategy
            ? exitStrategy(
                position.entryPrice,
                candles,
                pricePrecision,
                OrderSide.BUY
              )
            : { takeProfits: [], stopLoss: null };
        takeProfits = updatedTakeProfits;
        stopLoss = updatedStopLoss;
      }

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

      if (trailingStopConfig) {
        let activationPrice = calculateActivationPrice(
          trailingStopConfig,
          position.entryPrice,
          pricePrecision,
          takeProfits
        );

        this.orderTrailingStop(
          asset,
          base,
          activationPrice,
          Math.abs(position.size),
          'LONG',
          trailingStopConfig
        );
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
        .every(({ id, price, quantity, type, trailingStop }) => {
          const { entryPrice, size, leverage } = position;
          const fees = quantity * price * (MAKER_FEES / 100);

          // Price crossed the buy limit order
          if (
            type !== 'TRAILING_STOP_MARKET' &&
            lastCandle.high > price &&
            lastCandle.low < price
          ) {
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

                  this.stats.totalTrades++;
                  this.stats.longTrades++;
                  this.stats.totalFees += fees;
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
                  this.stats.totalTrades++;
                  this.stats.longTrades++;
                }

                // Update profit and loss
                if (pnl >= 0) {
                  this.stats.totalProfit += pnl;
                  this.stats.winningTrades++;
                } else {
                  this.stats.totalLoss += pnl;
                  this.stats.lostTrades++;
                }

                if (hasPosition && entryPrice >= price)
                  this.stats.shortWinningTrades++;
                if (hasPosition && entryPrice < price)
                  this.stats.shortLostTrades++;
                this.stats.totalFees += fees;
              }

              this.closeOpenOrder(id);
            }
          }

          // Trailing stops
          if (type === 'TRAILING_STOP_MARKET') {
            let activationPrice = price;
            let { status, callbackRate } = trailingStop;

            if (status === 'PENDING' && lastCandle.low <= activationPrice) {
              status = 'ACTIVE';
            }
            if (status === 'ACTIVE') {
              let stopLossPrice = lastCandle.open * (1 + callbackRate);
              // Trailing stop loss is activated
              if (lastCandle.high >= stopLossPrice) {
                let pnl = this.getPositionPNL(position, price);

                this.wallet.availableBalance += position.margin + pnl - fees;
                this.wallet.totalWalletBalance += pnl - fees;
                position.size += quantity;
                position.margin = Math.abs(position.size * price) / leverage;

                if (pnl >= 0) {
                  this.stats.totalProfit += pnl;
                  this.stats.shortWinningTrades++;
                  this.stats.winningTrades++;
                } else {
                  this.stats.totalLoss += pnl;
                  this.stats.shortLostTrades++;
                  this.stats.lostTrades++;
                }
                this.stats.totalFees += fees;
              }
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
        .every(({ id, price, quantity, type, trailingStop }) => {
          const { entryPrice, size, leverage } = position;
          const fees = quantity * price * (MAKER_FEES / 100);

          // Price crossed the sell limit order
          if (
            type !== 'TRAILING_STOP_MARKET' &&
            lastCandle.high > price &&
            lastCandle.low < price
          ) {
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

                  this.stats.totalTrades++;
                  this.stats.shortTrades++;
                  this.stats.totalFees += fees;
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
                  this.stats.totalTrades++;
                  this.stats.shortTrades++;
                }

                // Update profit and loss
                if (pnl >= 0) {
                  this.stats.totalProfit += pnl;
                  this.stats.winningTrades++;
                } else {
                  this.stats.totalLoss += pnl;
                  this.stats.lostTrades++;
                }

                if (hasPosition && entryPrice <= price)
                  this.stats.longWinningTrades++;
                if (hasPosition && entryPrice > price)
                  this.stats.longLostTrades++;
                this.stats.totalFees += fees;
              }

              this.closeOpenOrder(id);
            }
          }

          // Trailing stops
          if (type === 'TRAILING_STOP_MARKET') {
            let activationPrice = price;
            let { status, callbackRate } = trailingStop;
            if (status === 'PENDING' && lastCandle.high >= activationPrice) {
              status = 'ACTIVE';
            }
            if (status === 'ACTIVE') {
              let stopLossPrice = lastCandle.open * (1 - callbackRate);
              // Trailing stop loss is activated
              if (lastCandle.low <= stopLossPrice) {
                let pnl = this.getPositionPNL(position, price);

                this.wallet.availableBalance += position.margin + pnl - fees;
                this.wallet.totalWalletBalance += pnl - fees;
                position.size += quantity;
                position.margin = Math.abs(position.size * price) / leverage;

                if (pnl >= 0) {
                  this.stats.totalProfit += pnl;
                  this.stats.longWinningTrades++;
                  this.stats.winningTrades++;
                } else {
                  this.stats.totalLoss += pnl;
                  this.stats.longLostTrades++;
                  this.stats.lostTrades++;
                }
                this.stats.totalFees += fees;
              }
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
            this.stats.totalTrades++;
            this.stats.longTrades++;
          }
          this.stats.totalFees += fees;
        }
      } else if (position.positionSide === 'SHORT') {
        // Update wallet
        let pnl = this.getPositionPNL(position, price);
        wallet.availableBalance += position.margin + pnl - fees;
        wallet.totalWalletBalance += pnl - fees;
        this.stats.totalFees += fees;

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
          this.stats.totalTrades++;
          this.stats.longTrades++;
        }

        // Update profit and loss
        if (pnl >= 0) {
          this.stats.totalProfit += pnl;
        } else {
          this.stats.totalLoss += pnl;
        }

        if (hasPosition && entryPrice >= price) {
          this.stats.winningTrades++;
          this.stats.shortWinningTrades++;
        }
        if (hasPosition && entryPrice < price) {
          this.stats.lostTrades++;
          this.stats.shortLostTrades++;
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
            this.stats.totalTrades++;
            this.stats.shortTrades++;
          }
          this.stats.totalFees += fees;
        }
      } else if (position.positionSide === 'LONG') {
        // Update wallet
        let pnl = this.getPositionPNL(position, price);
        wallet.availableBalance += position.margin + pnl - fees;
        wallet.totalWalletBalance += pnl - fees;
        this.stats.totalFees += fees;

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
          this.stats.totalTrades++;
          this.stats.shortTrades++;
        }

        // Update profit and loss
        if (pnl >= 0) {
          this.stats.totalProfit += pnl;
        } else {
          this.stats.totalLoss += pnl;
        }

        if (hasPosition && entryPrice <= price) {
          this.stats.winningTrades++;
          this.stats.longWinningTrades++;
        }
        if (hasPosition && entryPrice > price) {
          this.stats.lostTrades++;
          this.stats.longLostTrades++;
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
   * Place a trailing stop order
   * @param asset
   * @param base
   * @param price
   * @param quantity
   * @param positionSide
   * @param trailingStopConfig
   */
  private orderTrailingStop(
    asset: string,
    base: string,
    price: number,
    quantity: number,
    positionSide: 'LONG' | 'SHORT',
    trailingStopConfig: TrailingStopConfig
  ) {
    const positions = this.wallet.positions;
    const position = positions.find((pos) => pos.pair === asset);
    const pair = asset + base;

    if (quantity < 0) {
      console.error(
        `Cannot execute the trailing stop order for ${pair}. The quantity is malformed: ${quantity}`
      );
      return;
    }

    let canOrder = quantity <= Math.abs(position.size);
    if (canOrder) {
      let order: FuturesOpenOrder = {
        id: Math.random().toString(16).slice(2),
        pair,
        type: 'TRAILING_STOP_MARKET',
        positionSide,
        price, // activation price
        quantity,
        trailingStop: {
          status: 'PENDING',
          callbackRate: trailingStopConfig.callbackRate,
          activation: {
            changePercentage: trailingStopConfig.activation.changePercentage,
            percentageToTP: trailingStopConfig.activation.changePercentage,
          },
        },
      };
      this.openOrders.push(order);
    } else {
      console.error(
        `Trailing stop order for the pair ${pair} cannot be placed`
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

    if (size !== 0 && margin + unrealizedProfit <= 0) {
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
   * Update the max drawdown and max balance with the current state of the wallet
   */
  private updateDrawdownMaxBalance() {
    // Max balance update
    if (this.wallet.totalWalletBalance > this.stats.maxBalance) {
      this.stats.maxBalance = this.wallet.totalWalletBalance;
    }
    // Max relative drawdown update
    let relativeDrawdown =
      (this.wallet.totalWalletBalance - this.stats.maxBalance) /
      this.stats.maxBalance;
    if (relativeDrawdown < this.stats.maxRelativeDrawdown) {
      this.stats.maxRelativeDrawdown = relativeDrawdown;
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

    // The traders must have a certain number of trades
    // if (
    //   this.stats.totalTrades < minimumTrades ||
    //   this.stats.totalTrades > maximumTrades
    // )
    //   return 0;

    // Kill the traders that are not profitable
    if (this.stats.totalProfit < this.stats.totalLoss) return 0;

    // Kill the traders with a drawdown too high
    if (this.stats.maxRelativeDrawdown < -0.1) return 0;

    let profitRatio =
      this.stats.totalProfit /
      (Math.abs(this.stats.totalLoss) + this.stats.totalFees);
    let totalNetProfit =
      this.stats.totalProfit -
      (Math.abs(this.stats.totalLoss) + this.stats.totalFees);
    let winRate = this.stats.winningTrades / this.stats.totalTrades;
    let roi =
      (this.wallet.totalWalletBalance - this.initialCapital) /
      this.initialCapital;

    // ========================================================= //
    // =================== SCORE CALCULATION =================== //
    // ========================================================= //
    // let score = totalNetProfit * winRate * profitRatio;
    // let score = roi * winRate * profitRatio;
    let score = winRate * profitRatio;
    // let score = totalNetProfit;
    // ========================================================= //

    return score;
  }
}

export default Trader;
