import { Binance, ExchangeInfo, OrderSide } from 'binance-api-node';
import dayjs from 'dayjs';
import chalk from 'chalk';
import { Counter } from '../../../tools/counter';
import Genome from './genome';
import { BINANCE_MODE, BotConfig } from '../../../init';
import { calculateActivationPrice } from '../../../utils/trailingStop';
import { normalize } from '../../../utils/math';
import { calculateIndicators } from '../indicators';
import {
  getPricePrecision,
  getQuantityPrecision,
  isValidQuantity,
} from '../../../utils/currencyInfo';
import {
  CANDLE_LENGTH_INPUTS,
  CANDLE_SOURCE,
  NEURAL_NETWORK_INPUTS_MODE,
} from '../loadConfig';
import {
  debugLastCandle,
  debugWallet,
  log,
  printDateBanner,
} from '../../../backtest/debug';

const DEBUG = false;

const TAKER_FEES = BotConfig['taker_fees_futures']; // %
const MAKER_FEES = BotConfig['maker_fees_futures']; // %

export interface PlayerParams {
  genomeInputs: number;
  genomeOutputs: number;
  strategyConfig: StrategyConfig;
  binanceClient: Binance;
  exchangeInfo: ExchangeInfo;
  initialCapital: number;
  goals: TraderGoals;
  brain?: Genome;
}

/**
 * The trader
 */
class Player {
  private strategyConfig: StrategyConfig;
  private binanceClient: Binance;
  private exchangeInfo: ExchangeInfo;
  private initialCapital: number;
  private goals: TraderGoals;

  public wallet: FuturesWallet;
  private openOrders: FuturesOpenOrder[];
  private counter: Counter; // to cut the position too long
  public stats: TraderStats; // Stats

  // NEAT Stuffs
  public fitness: number;
  private vision: number[]; // the inputs fed into the neuralNet
  private decision: number[]; // the outputs of the NN
  private unadjustedFitness: number;
  private lifespan: number; // how long the player lived for fitness
  public bestScore = 0; // stores the score achieved used for replay
  public dead: boolean;
  public score: number; // the traders must respect these goals
  public generation: number;

  private genomeInputs: number;
  private genomeOutputs: number;
  public brain: Genome;

  constructor({
    genomeInputs,
    genomeOutputs,
    strategyConfig,
    binanceClient,
    exchangeInfo,
    initialCapital,
    goals,
    brain,
  }: PlayerParams) {
    this.strategyConfig = strategyConfig;
    this.binanceClient = binanceClient;
    this.exchangeInfo = exchangeInfo;
    this.initialCapital = initialCapital;
    this.goals = goals;

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
          pair: this.strategyConfig.asset + this.strategyConfig.base,
          leverage: this.strategyConfig.leverage | 1,
          entryPrice: 0,
          margin: 0,
          positionSide: 'LONG',
          unrealizedProfit: 0,
          size: 0,
        },
      ],
    };

    // Neat stuffs
    this.fitness = 0;
    this.vision = [];
    this.decision = [];
    this.unadjustedFitness;
    this.lifespan = 0;
    this.bestScore = 0;
    this.dead = false;
    this.score = 0;
    this.generation = 0;
    this.genomeInputs = genomeInputs;
    this.genomeOutputs = genomeOutputs;
    this.brain = brain || new Genome(genomeInputs, genomeOutputs);
    this.brain.generateFullNetwork();

    if (strategyConfig.maxTradeDuration) {
      this.counter = new Counter(strategyConfig.maxTradeDuration);
    }
  }

  /**
   * Get inputs for brain
   */
  public look(candles: CandleData[]) {
    let vision: number[] = [];

    // If not exit strategy, we add an input to know if the player hold a position
    if (!this.strategyConfig.exitStrategy && BINANCE_MODE === 'futures') {
      const position = this.wallet.positions.find(
        (pos) =>
          pos.pair === this.strategyConfig.asset + this.strategyConfig.base
      );
      const holdingTrade = position.size !== 0 ? 1 : 0;
      vision.push(holdingTrade);
    }

    if (NEURAL_NETWORK_INPUTS_MODE === 'candles') {
      const getCandleSource = (candles: CandleData[]) => {
        if (CANDLE_SOURCE === 'open') return candles.map((c) => c.open);
        else if (CANDLE_SOURCE === 'close') return candles.map((c) => c.close);
        else if (CANDLE_SOURCE === 'high') return candles.map((c) => c.high);
        else if (CANDLE_SOURCE === 'low') return candles.map((c) => c.low);
        else if (CANDLE_SOURCE === 'hl2')
          return candles.map((c) => (c.high + c.low) / 2);
        else return candles.map((c) => c.close);
      };

      let candleVision = getCandleSource(candles).slice(-CANDLE_LENGTH_INPUTS);
      // Get max and min
      let min = Math.min(...candleVision);
      let max = Math.max(...candleVision);
      // Normalize values
      candleVision = candleVision.map((val) => normalize(val, min, max, 0, 1));
      // Add to the array
      vision = vision.concat(candleVision);
    } else {
      // The values are already normalized
      let indicatorVision = calculateIndicators(candles);
      // Add to the array
      vision = vision.concat(indicatorVision);
    }

    this.vision = vision;
  }

  /**
   * Move the player according to the outputs from the neural network
   * @param strategyConfig
   * @param candles
   * @param currentPrice
   */
  public update(
    strategyConfig: StrategyConfig,
    candles: CandleData[],
    currentPrice: number
  ) {
    this.lifespan++;

    let {
      totalLoss,
      totalProfit,
      totalFees,
      winningTrades,
      totalTrades,
      maxRelativeDrawdown,
    } = this.stats;

    const profitRatio = totalProfit / (Math.abs(totalLoss) + totalFees);
    const totalNetProfit = totalProfit - (Math.abs(totalLoss) + totalFees);
    const winRate = winningTrades / totalTrades;
    const roi =
      (this.wallet.totalWalletBalance - this.initialCapital) /
      this.initialCapital;

    // Kill the bad traders
    if (this.wallet.totalWalletBalance <= 0) {
      this.dead = true;
      return;
    }

    // Kill the traders that doesn't trades
    if (this.lifespan > 100 && totalLoss === 0 && totalProfit === 0) {
      this.dead = true;
      return;
    }

    // Kill the traders that take too much risk
    if (
      this.goals.maxRelativeDrawdown &&
      maxRelativeDrawdown < this.goals.maxRelativeDrawdown
    ) {
      this.dead = true;
      return;
    }

    // Kill the traders that have a bad winRate
    if (this.goals.winRate && !isNaN(winRate) && winRate < this.goals.winRate) {
      this.dead = true;
      return;
    }

    // Kill the traders with a bad risk reward
    if (
      this.goals.profitRatio &&
      !isNaN(profitRatio) &&
      profitRatio < this.goals.profitRatio
    ) {
      this.dead = true;
      return;
    }

    const { asset, base } = strategyConfig;
    this.checkPositionMargin(asset + base, currentPrice);
    this.checkFuturesOpenOrders(asset, base, candles);
    this.trade(this.strategyConfig, currentPrice, candles, this.exchangeInfo);

    // Update the max drawdown and max balance property for the strategy report
    this.updateDrawdownMaxBalance();

    // We measure the score of the trader by the profit generated
    this.score = totalNetProfit;

    // debug
    if (DEBUG) {
      this.updatePNL(strategyConfig.asset, strategyConfig.base, currentPrice);
      this.updateTotalPNL();

      printDateBanner(candles[candles.length - 1].openTime);
      log(`vision: ${this.vision.toString()}`);
      log(`decision: ${this.decision.toString()}`);
      debugLastCandle(candles[candles.length - 1]);
      debugWallet(null, this.wallet);
    }
  }

  /**
   * Gets the output of the brain, then converts them to actions
   */
  public think() {
    var max = 0;
    var maxIndex = 0;

    // Get the output of the neural network
    this.decision = this.brain.feedForward(this.vision);

    for (var i = 0; i < this.decision.length; i++) {
      if (this.decision[i] > max) {
        max = this.decision[i];
        maxIndex = i;
      }
    }
  }

  /**
   * Main function to take a decision about the market
   */
  private trade(
    strategyConfig: StrategyConfig,
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
      maxTradeDuration,
    } = strategyConfig;
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

    // Decision to take
    let max = Math.max(...this.decision);
    const isBuySignal =
      max === this.decision[0] && this.decision[0] > 0.6 && !hasShortPosition;
    const isSellSignal =
      max === this.decision[1] && this.decision[1] > 0.6 && !hasLongPosition;
    const closePosition =
      max === this.decision[2] &&
      this.decision[2] > 0.6 &&
      (hasShortPosition || hasLongPosition);

    // Conditions to take or not a position
    const canAddToPosition = allowPyramiding
      ? position.margin + assetBalance * risk <=
        assetBalance * maxPyramidingAllocation
      : false;
    const canTakeLongPosition =
      (!allowPyramiding && !hasLongPosition) || allowPyramiding;
    const canTakeShortPosition =
      (!allowPyramiding && !hasShortPosition) || allowPyramiding;
    const canClosePosition =
      Math.abs(currentPrice - position.entryPrice) >=
      position.entryPrice * 0.01;

    // Open orders
    const currentOpenOrders = this.openOrders.filter(
      (order) => order.pair === pair
    );

    // Currency infos
    const pricePrecision = getPricePrecision(pair, exchangeInfo);
    const quantityPrecision = getQuantityPrecision(pair, exchangeInfo);

    // Check if we are in the trading sessions
    const isTradingSessionActive = this.isTradingSessionActive(
      candles[candles.length - 1].openTime,
      tradingSession
    );

    // The current position is too long
    if (
      maxTradeDuration &&
      (hasShortPosition || hasLongPosition) &&
      this.counter
    ) {
      this.counter.decrement();
      if (this.counter.getValue() == 0) {
        if (DEBUG)
          log(
            `The trade on ${pair} is longer that the maximum authorized duration. Position has been closed.`
          );
        this.orderMarket(
          pair,
          currentPrice,
          Math.abs(position.size),
          hasLongPosition ? 'SELL' : 'BUY'
        );
        this.counter.reset();
        this.closeOpenOrders(pair);
        return;
      }
    }

    // Prevent remaining open orders when all the take profit or a stop loss has been filled
    if (!hasLongPosition && !hasShortPosition && currentOpenOrders.length > 0) {
      this.closeOpenOrders(pair);
    }

    // Reset the counter if a previous trade close a the position
    if (
      maxTradeDuration &&
      !hasLongPosition &&
      !hasShortPosition &&
      this.counter.getValue() < maxTradeDuration
    ) {
      this.counter.reset();
    }

    // Close the current position
    if (
      closePosition &&
      (hasLongPosition || hasShortPosition) &&
      canClosePosition
    ) {
      this.orderMarket(
        pair,
        currentPrice,
        Math.abs(position.size),
        hasLongPosition ? 'SELL' : 'BUY'
      );
      if (DEBUG) log(`The position on ${pair} has been closed.`);
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
        this.closeOpenOrders(pair);
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
        this.closeOpenOrders(pair);
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
        this.closeOpenOrders(pair);
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
        this.closeOpenOrders(pair);
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
        this.closeOpenOrders(pair);
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

                  if (DEBUG)
                    log(
                      `Long order #${id} has been activated for ${quantity}${asset} at ${price}. Fees: ${fees}`,
                      chalk.magenta
                    );
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

                if (DEBUG)
                  log(
                    `${
                      entryPrice < price
                        ? '[SL]'
                        : entryPrice > price
                        ? '[TP]'
                        : '[BE]'
                    } Long order #${id} has been activated for ${quantity}${asset} at ${price}. Fees: ${fees}`,
                    chalk.magenta
                  );
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

                if (DEBUG)
                  log(
                    `Trailing stop long order #${id} has been activated for ${Math.abs(
                      quantity
                    )}${asset} at ${price}. Fees: ${fees}`,
                    chalk.magenta
                  );
              }
            }
          }

          // If an order close the position, do not continue to check the other orders.
          // Prevent to have multiple orders touches at the same time
          if (position.size === 0) {
            this.closeOpenOrders(pair);
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

                  if (DEBUG)
                    log(
                      `Sell order #${id} has been activated for ${Math.abs(
                        quantity
                      )}${asset} at ${price}. Fees: ${fees}`,
                      chalk.magenta
                    );
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

                if (DEBUG)
                  log(
                    `${
                      entryPrice > price
                        ? '[SL]'
                        : entryPrice < price
                        ? '[TP]'
                        : '[BE]'
                    } Sell order #${id} has been activated for ${quantity}${asset} at ${price}. Fees: ${fees}`,
                    chalk.magenta
                  );
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

                if (DEBUG)
                  log(
                    `Trailing stop sell order #${id} has been activated for ${Math.abs(
                      quantity
                    )}${asset} at ${price}. Fees: ${fees}`,
                    chalk.magenta
                  );
              }
            }
          }

          // If an order close the position, do not continue to check the other orders.
          // Prevent to have multiple orders touches at the same time
          if (position.size === 0) {
            this.closeOpenOrders(pair);
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

    if (quantity < 0) {
      console.error(
        `Cannot execute the market order for ${pair}. The quantity is malformed: ${quantity}`
      );
      return;
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

          if (!hasPosition) {
            this.stats.totalTrades++;
            this.stats.longTrades++;
          }
          this.stats.totalFees += fees;

          if (DEBUG)
            log(
              `Take a long position on ${pair} with a size of ${quantity} at ${price}. Fees: ${fees}`,
              chalk.green
            );
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

        if (DEBUG)
          log(
            `Take a long position on ${pair} with a size of ${quantity} at ${price}. Fees: ${fees}`,
            chalk.green
          );
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

          if (DEBUG)
            log(
              `Take a short position on ${pair} with a size of ${-quantity} at ${price}. Fees: ${fees}`,
              chalk.red
            );
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

        if (DEBUG)
          log(
            `Take a short position on ${pair} with a size of ${-quantity} at ${price}. Fees: ${fees}`,
            chalk.red
          );
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
      if (DEBUG)
        log(`The position on ${pair} has reached the liquidation price.`);
      this.orderMarket(
        pair,
        currentPrice,
        Math.abs(size),
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
  private closeOpenOrders(pair: string) {
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
   * Update the pnl of the position object
   * @param asset
   * @param base
   * @param currentPrice
   */
  private updatePNL(asset: string, base: string, currentPrice: number) {
    let positions = this.wallet.positions;
    let indexAsset = positions.findIndex((pos) => pos.pair === asset + base);
    let position = positions[indexAsset];
    position.unrealizedProfit = this.getPositionPNL(position, currentPrice);
  }

  /**
   * Update the total unrealized profit property of the futures wallet object
   */
  private updateTotalPNL() {
    let totalPNL = 0;
    this.wallet.positions
      .filter(
        (position) =>
          position.size !== 0 && position.margin > 0 && position.entryPrice > 0
      )
      .forEach((position) => {
        totalPNL += position.unrealizedProfit;
      });
    this.wallet.totalUnrealizedProfit = totalPNL;
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
   * Returns a clone of this player with the same brain
   */
  public clone() {
    var clone = new Player({
      genomeInputs: this.genomeInputs,
      genomeOutputs: this.genomeOutputs,
      strategyConfig: this.strategyConfig,
      binanceClient: this.binanceClient,
      exchangeInfo: this.exchangeInfo,
      initialCapital: this.initialCapital,
      goals: this.goals,
    });
    clone.brain = this.brain.clone();
    clone.fitness = this.fitness;
    clone.brain.generateNetwork();
    clone.generation = this.generation;
    clone.bestScore = this.score;

    return clone;
  }

  /**
   * Since there is some randomness in games sometimes when we want to replay the game we need to remove that randomness
   * this function does that
   */
  public cloneForReplay() {
    var clone = new Player({
      genomeInputs: this.genomeInputs,
      genomeOutputs: this.genomeOutputs,
      strategyConfig: this.strategyConfig,
      binanceClient: this.binanceClient,
      exchangeInfo: this.exchangeInfo,
      initialCapital: this.initialCapital,
      goals: this.goals,
    });
    clone.brain = this.brain.clone();
    clone.fitness = this.fitness;
    clone.brain.generateNetwork();
    clone.generation = this.generation;
    clone.bestScore = this.score;
    clone.stats = this.stats;
    clone.wallet = this.wallet;
    clone.openOrders = this.openOrders;

    return clone;
  }

  /**
   * Genetic algorithm
   */
  public calculateFitness() {
    // Fitness Formulas
    this.fitness = this.wallet.totalWalletBalance;
  }

  public crossover(parent: Player) {
    var child = new Player({
      genomeInputs: this.genomeInputs,
      genomeOutputs: this.genomeOutputs,
      strategyConfig: this.strategyConfig,
      binanceClient: this.binanceClient,
      exchangeInfo: this.exchangeInfo,
      initialCapital: this.initialCapital,
      goals: this.goals,
    });
    child.brain = this.brain.crossover(parent.brain);
    child.brain.generateNetwork();
    return child;
  }
}

export default Player;
