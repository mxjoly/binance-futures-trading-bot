import {
  ExchangeInfo,
  FuturesAccountInfoResult,
  OrderSide,
  OrderType,
} from 'binance-api-node';
import { decimalFloor } from './utils/math';
import { log, error, logBuySellExecutionOrder } from './utils/log';
import { binanceClient } from './init';
import { loadCandlesMultiTimeFramesFromAPI } from './utils/loadCandleData';
import { Counter } from './tools/counter';
import { calculateActivationPrice } from './utils/trailingStop';
import { isOnTradingSession } from './utils/tradingSession';
import { sendTelegramMessage } from './telegram';
import {
  getPricePrecision,
  getQuantityPrecision,
  isValidQuantity,
} from './utils/currencyInfo';
import dayjs from 'dayjs';

// ====================================================================== //

/**
 * Production bot
 */
export class Bot {
  private strategyConfigs: StrategyConfig[];

  private exchangeInfo: ExchangeInfo;
  private accountInfo: FuturesAccountInfoResult;
  private hasOpenPosition: { [pair: string]: boolean };

  // Counter to fix the max duration of each trade
  private counters: { [symbol: string]: Counter };

  private currentDay: string;
  private lastDayBalance: number;
  private currentBalance: number; // temp balance

  constructor(tradeConfigs: StrategyConfig[]) {
    this.strategyConfigs = tradeConfigs;
    this.counters = {};
    this.hasOpenPosition = {};
    this.currentDay = dayjs(Date.now()).format('DD/MM/YYYY');
  }

  /**
   * Prepare the account
   */
  public prepare() {
    // Set the margin type and initial leverage for the futures
    this.strategyConfigs.forEach((tradeConfig) => {
      const pair = tradeConfig.asset + tradeConfig.base;

      binanceClient
        .futuresLeverage({
          symbol: pair,
          leverage: tradeConfig.leverage || 1,
        })
        .then(() =>
          log(`Leverage for ${pair} is set to ${tradeConfig.leverage || 1}`)
        )
        .catch(error);

      binanceClient
        .futuresMarginType({
          symbol: pair,
          marginType: 'ISOLATED',
        })
        .catch(error);

      // No position is open at the launch
      this.hasOpenPosition[pair] = false;
    });

    // Initialize the counters
    this.strategyConfigs.forEach(({ asset, base, maxTradeDuration }) => {
      if (maxTradeDuration)
        this.counters[asset + base] = new Counter(maxTradeDuration);
    });
  }

  /**
   * Main function
   */
  public async run() {
    log(
      '====================== 💵 BINANCE BOT TRADING 💵 ======================'
    );

    // Get the exchange info
    this.exchangeInfo = await binanceClient.futuresExchangeInfo();

    // Store account information to local
    this.lastDayBalance = Number(
      (await binanceClient.futuresAccountBalance()).find(
        (b) => b.asset === 'USDT'
      ).balance
    );
    this.currentBalance = this.lastDayBalance;

    // Main
    this.strategyConfigs.forEach((strategyConfig) => {
      const pair = strategyConfig.asset + strategyConfig.base;
      log(`The bot trades the pair ${pair}`);

      binanceClient.ws.futuresCandles(
        pair,
        strategyConfig.loopInterval,
        async (candle) => {
          if (candle.isFinal) {
            // Check if a previous trade has been closed
            this.syncOpenPosition(pair);

            // Load the candle data for each the time frames that will be use on the strategy
            loadCandlesMultiTimeFramesFromAPI(
              strategyConfig,
              binanceClient
            ).then((candlesMultiTimeFrames) => {
              this.trade(
                strategyConfig,
                Number(candle.close),
                candlesMultiTimeFrames
              ).then(() => {
                // Check if a previous trade has been closed
                this.syncOpenPosition(pair);
              });
            });
          }

          // Day change
          let candleDate = dayjs(new Date(candle.closeTime)).format(
            'DD/MM/YYYY'
          );
          if (candleDate !== this.currentDay) {
            this.sendDailyResults();
            this.currentDay = candleDate;
          }
        }
      );
    });
  }

  /**
   * Main function (long/short, open/close orders)
   * @param strategyConfig
   * @param currentPrice
   * @param candles
   */
  private async trade(
    strategyConfig: StrategyConfig,
    currentPrice: number,
    candles: CandlesDataMultiTimeFrames
  ) {
    const {
      asset,
      base,
      risk,
      buyStrategy,
      sellStrategy,
      exitStrategy,
      trendFilter,
      riskManagement,
      tradingSessions,
      canOpenNewPositionToCloseLast,
      trailingStopConfig,
      allowPyramiding,
      maxPyramidingAllocation,
      unidirectional,
      loopInterval,
      maxTradeDuration,
    } = strategyConfig;
    const pair = asset + base;

    // Update the account info
    this.accountInfo = await binanceClient.futuresAccountInfo();

    // Balance information
    const balances = this.accountInfo.assets;
    const { walletBalance: assetBalance, availableBalance } = balances.find(
      (balance) => balance.asset === base
    );

    // Position information
    const positions = this.accountInfo.positions;
    const position = positions.find((position) => position.symbol === pair);
    const hasLongPosition = Number(position.positionAmt) > 0;
    const hasShortPosition = Number(position.positionAmt) < 0;
    const positionSize = Math.abs(Number(position.positionAmt));
    const positionEntryPrice = Number(position.entryPrice);

    // Open Orders
    const currentOpenOrders = await binanceClient.futuresOpenOrders({
      symbol: pair,
    });

    // Check the trend
    const useLongPosition = trendFilter ? trendFilter(candles) === 1 : true;
    const useShortPosition = trendFilter ? trendFilter(candles) === -1 : true;

    // Conditions to take or not a position
    const canAddToPosition = allowPyramiding
      ? Number(position.initialMargin) + Number(assetBalance) * risk <=
        Number(assetBalance) * maxPyramidingAllocation
      : false;
    const canTakeLongPosition =
      (canOpenNewPositionToCloseLast && hasShortPosition) ||
      (!canOpenNewPositionToCloseLast &&
        hasShortPosition &&
        currentOpenOrders.length === 0) ||
      (!allowPyramiding && !hasLongPosition) ||
      (allowPyramiding && hasShortPosition && currentOpenOrders.length === 0) ||
      (allowPyramiding &&
        hasShortPosition &&
        currentOpenOrders.length > 0 &&
        canOpenNewPositionToCloseLast);
    const canTakeShortPosition =
      (canOpenNewPositionToCloseLast && hasLongPosition) ||
      (!canOpenNewPositionToCloseLast &&
        hasLongPosition &&
        currentOpenOrders.length === 0) ||
      (!allowPyramiding && !hasShortPosition) ||
      (allowPyramiding && hasLongPosition && currentOpenOrders.length === 0) ||
      (allowPyramiding &&
        hasLongPosition &&
        currentOpenOrders.length > 0 &&
        canOpenNewPositionToCloseLast);

    // Precision
    const pricePrecision = getPricePrecision(pair, this.exchangeInfo);
    const quantityPrecision = getQuantityPrecision(pair, this.exchangeInfo);

    // Check if we are in the trading sessions
    const isTradingSessionActive = isOnTradingSession(
      candles[loopInterval][candles[loopInterval].length - 1].closeTime,
      tradingSessions
    );

    // The current position is too long
    if (
      maxTradeDuration &&
      (hasShortPosition || hasLongPosition) &&
      this.counters[pair]
    ) {
      this.counters[pair].decrement();
      if (this.counters[pair].getValue() == 0) {
        binanceClient
          .futuresOrder({
            symbol: pair,
            type: OrderType.MARKET,
            quantity: String(positionSize),
            side: hasLongPosition ? OrderSide.SELL : OrderSide.BUY,
          })
          .then(() => {
            log(
              `The position on ${pair} is longer that the maximum authorized duration.`
            );
          })
          .catch(error);
        return;
      }
    }

    // Reset the counter if a previous trade close the position
    if (
      maxTradeDuration &&
      !hasLongPosition &&
      !hasShortPosition &&
      this.counters[pair].getValue() < maxTradeDuration
    ) {
      this.counters[pair].reset();
    }

    if (
      (isTradingSessionActive || positionSize !== 0) &&
      canTakeLongPosition &&
      buyStrategy(candles)
    ) {
      // Take the profit and not open a new position
      if (hasShortPosition && unidirectional) {
        binanceClient
          .futuresOrder({
            side: OrderSide.BUY,
            type: OrderType.MARKET,
            symbol: pair,
            quantity: String(positionSize),
          })
          .catch(error);
        return;
      }

      // Do not trade with long position if the trend is down
      if (!useLongPosition) return;

      // Do not add to the current position if the allocation is over the max allocation
      if (allowPyramiding && hasLongPosition && !canAddToPosition) return;

      // Calculate TP and SL
      let { takeProfits, stopLoss } = exitStrategy
        ? exitStrategy(
            currentPrice,
            candles,
            pricePrecision,
            OrderSide.BUY,
            this.exchangeInfo
          )
        : { takeProfits: [], stopLoss: null };

      //Calculate the quantity for the position according to the risk management of the strategy
      let quantity = riskManagement({
        asset,
        base,
        balance: allowPyramiding
          ? Number(assetBalance)
          : Number(availableBalance),
        risk,
        enterPrice: currentPrice,
        stopLossPrice: stopLoss,
        exchangeInfo: this.exchangeInfo,
      });

      // Quantity to add to close the previous position
      let previousPositionQuantity = hasShortPosition ? positionSize : 0;

      // To close the previous short position
      if (
        isValidQuantity(
          quantity + previousPositionQuantity,
          pair,
          this.exchangeInfo
        )
      ) {
        quantity += previousPositionQuantity;
      } else {
        throw new Error(`Invalid quantity order for ${pair}: ${quantity}`);
      }

      binanceClient
        .futuresOrder({
          side: OrderSide.BUY,
          type: OrderType.MARKET,
          symbol: pair,
          quantity: String(quantity),
        })
        .then(() => {
          // Cancel the previous orders to update them
          if (currentOpenOrders.length > 0) {
            this.closeOpenOrders(pair);
          }

          // Calculate the total size and the average entry price on the position updated
          const positionTotalSize = positionSize + quantity;
          const avgPrice =
            (positionSize * positionEntryPrice + quantity * currentPrice) /
            (positionSize + quantity);

          // In pyramiding mode, update the take profits and stop loss
          if (allowPyramiding && hasLongPosition) {
            let { takeProfits: updatedTakeProfits, stopLoss: updatedStopLoss } =
              exitStrategy
                ? exitStrategy(
                    avgPrice,
                    candles,
                    pricePrecision,
                    OrderSide.BUY,
                    this.exchangeInfo
                  )
                : { takeProfits: [], stopLoss: null };
            takeProfits = updatedTakeProfits;
            stopLoss = updatedStopLoss;
          }

          if (takeProfits.length > 0) {
            // Create the take profit orders
            takeProfits.forEach(({ price, quantityPercentage }) => {
              binanceClient
                .futuresOrder({
                  side: OrderSide.SELL,
                  type: OrderType.LIMIT,
                  symbol: pair,
                  price,
                  quantity: String(
                    decimalFloor(
                      Number(positionTotalSize) * quantityPercentage,
                      quantityPrecision
                    )
                  ),
                })
                .catch(error);
            });
          }

          if (stopLoss) {
            // Stop loss order
            binanceClient
              .futuresOrder({
                side: OrderSide.SELL,
                type: OrderType.STOP,
                symbol: pair,
                stopPrice: stopLoss,
                price: stopLoss,
                quantity: String(positionTotalSize),
              })
              .catch(error);
          }

          if (trailingStopConfig) {
            let activationPrice = calculateActivationPrice(
              trailingStopConfig,
              avgPrice,
              pricePrecision,
              takeProfits
            );

            binanceClient
              .futuresOrder({
                side: OrderSide.SELL,
                type: OrderType.TRAILING_STOP_MARKET,
                symbol: pair,
                quantity: String(positionTotalSize),
                callbackRate: trailingStopConfig.callbackRate * 100,
                activationPrice,
              })
              .catch(error);
          }

          if (hasLongPosition) {
            log(
              `Add ${quantity}${asset} to the long position on ${pair}. The average entry price is now ${avgPrice}${base} and the total size ${positionTotalSize}${asset}`
            );
          } else {
            logBuySellExecutionOrder(
              OrderSide.BUY,
              asset,
              base,
              currentPrice,
              quantity,
              takeProfits,
              stopLoss
            );
            sendTelegramMessage(
              `Long position open on ${pair} at ${currentPrice} with ${quantity}${asset} 😈`
            );
          }
        })
        .catch(error);
    } else if (
      (isTradingSessionActive || positionSize !== 0) &&
      canTakeShortPosition &&
      sellStrategy(candles)
    ) {
      // Take the profit and not open a new position
      if (hasLongPosition && unidirectional) {
        binanceClient
          .futuresOrder({
            side: OrderSide.SELL,
            type: OrderType.MARKET,
            symbol: pair,
            quantity: String(positionSize),
          })
          .catch(error);
        return;
      }

      // Do not trade with short position if the trend is up
      if (!useShortPosition) return;

      // Do not add to the current position if the allocation is over the max allocation
      if (allowPyramiding && hasShortPosition && !canAddToPosition) return;

      // Calculate TP and SL
      let { takeProfits, stopLoss } = exitStrategy
        ? exitStrategy(
            currentPrice,
            candles,
            pricePrecision,
            OrderSide.SELL,
            this.exchangeInfo
          )
        : { takeProfits: [], stopLoss: null };

      // Calculate the quantity for the position according to the risk management of the strategy
      let quantity = riskManagement({
        asset,
        base,
        balance: allowPyramiding
          ? Number(assetBalance)
          : Number(availableBalance),
        risk,
        enterPrice: currentPrice,
        stopLossPrice: stopLoss,
        exchangeInfo: this.exchangeInfo,
      });

      // Quantity to add to close the previous position
      let previousPositionQuantity = hasLongPosition ? positionSize : 0;

      // To close the previous long position
      if (
        isValidQuantity(
          quantity + previousPositionQuantity,
          pair,
          this.exchangeInfo
        )
      ) {
        quantity += previousPositionQuantity;
      } else {
        throw new Error(`Invalid quantity order for ${pair}: ${quantity}`);
      }

      binanceClient
        .futuresOrder({
          side: OrderSide.SELL,
          type: OrderType.MARKET,
          symbol: pair,
          quantity: String(quantity),
        })
        .then(() => {
          // Cancel the previous orders to update them
          if (currentOpenOrders.length > 0) {
            this.closeOpenOrders(pair);
          }

          // Calculate the total size and the average entry price on the position updated
          const positionTotalSize = positionSize + quantity;
          const avgPrice =
            (positionSize * positionEntryPrice + quantity * currentPrice) /
            (positionSize + quantity);

          // In pyramiding mode, update the take profits and stop loss
          if (allowPyramiding && hasShortPosition) {
            let { takeProfits: updatedTakeProfits, stopLoss: updatedStopLoss } =
              exitStrategy
                ? exitStrategy(
                    avgPrice,
                    candles,
                    pricePrecision,
                    OrderSide.BUY,
                    this.exchangeInfo
                  )
                : { takeProfits: [], stopLoss: null };
            takeProfits = updatedTakeProfits;
            stopLoss = updatedStopLoss;
          }

          if (takeProfits.length > 0) {
            // Create the take profit orders
            takeProfits.forEach(({ price, quantityPercentage }) => {
              binanceClient
                .futuresOrder({
                  side: OrderSide.BUY,
                  type: OrderType.LIMIT,
                  symbol: pair,
                  price: price,
                  quantity: String(
                    decimalFloor(
                      Number(positionTotalSize) * quantityPercentage,
                      quantityPrecision
                    )
                  ),
                })
                .catch(error);
            });
          }

          if (stopLoss) {
            // Stop loss order
            binanceClient
              .futuresOrder({
                side: OrderSide.BUY,
                type: OrderType.STOP,
                symbol: pair,
                stopPrice: stopLoss,
                price: stopLoss,
                quantity: String(positionTotalSize),
              })
              .catch(error);
          }

          if (trailingStopConfig) {
            let activationPrice = calculateActivationPrice(
              trailingStopConfig,
              avgPrice,
              pricePrecision,
              takeProfits
            );

            binanceClient
              .futuresOrder({
                side: OrderSide.BUY,
                type: OrderType.TRAILING_STOP_MARKET,
                symbol: pair,
                quantity: String(positionTotalSize),
                callbackRate: trailingStopConfig.callbackRate * 100,
                activationPrice,
              })
              .catch(error);
          }

          if (hasShortPosition) {
            log(
              `Add ${quantity}${asset} to the short position on ${pair}. The average entry price is now ${avgPrice}${base} and the total size ${positionTotalSize}${asset}`
            );
          } else {
            logBuySellExecutionOrder(
              OrderSide.SELL,
              asset,
              base,
              currentPrice,
              quantity,
              takeProfits,
              stopLoss
            );
            sendTelegramMessage(
              `Short position open on ${pair} at ${currentPrice} with ${quantity}${asset} 😈`
            );
          }
        })
        .catch(error);
    }
  }

  /**
   * Check if a position has been closed
   * @param pair
   */
  private async syncOpenPosition(pair: string) {
    this.accountInfo = await binanceClient.futuresAccountInfo();
    const position = this.accountInfo.positions.find(
      (position) => position.symbol === pair
    );
    const hasOpenPosition = Number(position.positionAmt) !== 0;

    if (this.hasOpenPosition[pair] && !hasOpenPosition) {
      this.hasOpenPosition[pair] = false;
      this.sendTradeResult(pair);
      this.closeOpenOrders(pair);
      if (this.counters[pair]) this.counters[pair].reset();
    }
  }

  /**
   *  Close all the open orders for a given symbol
   * @param pair
   */
  private closeOpenOrders(pair: string) {
    return new Promise<void>((resolve, reject) => {
      binanceClient
        .futuresCancelAllOpenOrders({ symbol: pair })
        .then(() => {
          log(`Close all open orders for the pair ${pair}`);
          resolve();
        })
        .catch(reject);
    });
  }

  private sendTradeResult(pair: string) {
    // Profit percent on the total wallet balance
    let result =
      ((Number(this.accountInfo.totalWalletBalance) - this.currentBalance) /
        this.currentBalance) *
      100;

    log(
      `Trade closed on ${pair}: ${result > 0 ? `+${result}% ` : `${result}%`}`
    );
    sendTelegramMessage(
      `Trade closed on ${pair}: ${result > 0 ? `+${result}% ` : `${result}%`} ${
        result >= 0 ? '🟢' : '🔴'
      }`
    );
  }

  /**
   * Send the results of the day to the telegram channel
   */
  private sendDailyResults() {
    // Send message for the performance of the day
    let performance = decimalFloor(
      ((this.currentBalance - this.lastDayBalance) / this.lastDayBalance) * 100,
      2
    );

    let emoji =
      performance > 30
        ? '🤩'
        : performance > 20
        ? '🤑'
        : performance > 10
        ? '😍'
        : performance > 0
        ? '🥰'
        : performance > -10
        ? '😢'
        : performance > -20
        ? '😰'
        : '😭';

    let message =
      `RESULTATS DU ${this.currentDay}` +
      '\n' +
      `${performance > 0 ? `+${performance}%` : `${performance}%`} ${emoji}`;

    sendTelegramMessage(message);
  }
}
