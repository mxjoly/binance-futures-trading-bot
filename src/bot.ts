import {
  CandleChartInterval,
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
import { isOnTradingSession } from './utils/tradingSession';
import { sendTelegramMessage } from './telegram';
import dayjs from 'dayjs';
import { getPricePrecision, getQuantityPrecision } from './utils/currencyInfo';

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

  // Time
  private currentDay: string;
  private currentMonth: string;
  private lastDayBalance: number;
  private lastMonthBalance: number;
  private currentBalance: number; // temp balance

  constructor(tradeConfigs: StrategyConfig[]) {
    this.strategyConfigs = tradeConfigs;
    this.counters = {};
    this.hasOpenPosition = {};
    this.currentDay = dayjs(Date.now()).format('DD/MM/YYYY');
    this.currentMonth = dayjs(Date.now()).format('MM/YYYY');
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
    this.currentBalance = Number(
      (await binanceClient.futuresAccountBalance()).find(
        (b) => b.asset === this.strategyConfigs[0].base
      ).balance
    );
    this.lastMonthBalance = this.currentBalance;
    this.lastDayBalance = this.currentBalance;

    // Main
    this.strategyConfigs.forEach((strategyConfig) => {
      const pair = strategyConfig.asset + strategyConfig.base;
      log(`The bot trades the pair ${pair}`);

      binanceClient.ws.futuresCandles(
        pair,
        strategyConfig.loopInterval,
        (candle) => {
          if (candle.isFinal) {
            // If a position has been closed, cancel the open orders
            this.manageOpenOrders(pair);

            // Load the candle data for each the time frames that will be use on the strategy
            loadCandlesMultiTimeFramesFromAPI(
              pair,
              Array.from(
                new Set<CandleChartInterval>([
                  ...strategyConfig.indicatorIntervals,
                  strategyConfig.loopInterval,
                ])
              ),
              binanceClient
            ).then(async (candlesMultiTimeFrames) => {
              await this.trade(
                strategyConfig,
                Number(candle.close),
                candlesMultiTimeFrames
              );

              // Update the current balance
              this.currentBalance = Number(
                (await binanceClient.futuresAccountBalance()).find(
                  (b) => b.asset === this.strategyConfigs[0].base
                ).balance
              );
            });

            // Day change ?
            let candleDay = dayjs(new Date(candle.closeTime)).format(
              'DD/MM/YYYY'
            );
            if (candleDay !== this.currentDay) {
              this.sendDailyResult();
              this.currentDay = candleDay;
            }

            // Month change ?
            let candleMonth = dayjs(new Date(candle.closeTime)).format(
              'MM/YYYY'
            );
            if (candleMonth !== this.currentMonth) {
              this.sendMonthResult();
              this.currentMonth = candleMonth;
            }
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

      // Close the open orders of the last trade
      if (hasShortPosition && currentOpenOrders.length > 0) {
        await this.closeOpenOrders(pair);
      }

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

      binanceClient
        .futuresOrder({
          side: OrderSide.BUY,
          type: OrderType.MARKET,
          symbol: pair,
          quantity: String(
            hasShortPosition ? quantity - positionSize : quantity
          ),
        })
        .then(() => {
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
                      quantity * quantityPercentage,
                      quantityPrecision
                    )
                  ),
                })
                .catch(error);
            });
          }

          if (stopLoss) {
            if (takeProfits.length > 1) {
              binanceClient
                .futuresOrder({
                  side: OrderSide.SELL,
                  type: OrderType.STOP_MARKET,
                  symbol: pair,
                  stopPrice: stopLoss,
                  closePosition: 'true',
                })
                .catch(error);
            } else {
              binanceClient
                .futuresOrder({
                  side: OrderSide.SELL,
                  type: OrderType.STOP,
                  symbol: pair,
                  stopPrice: stopLoss,
                  price: stopLoss,
                  quantity: String(quantity),
                })
                .catch(error);
            }
          }

          logBuySellExecutionOrder(
            OrderSide.BUY,
            asset,
            base,
            currentPrice,
            quantity,
            takeProfits,
            stopLoss
          );
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

      // Close the open orders of the last trade
      if (hasLongPosition && currentOpenOrders.length > 0) {
        await this.closeOpenOrders(pair);
      }

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

      binanceClient
        .futuresOrder({
          side: OrderSide.SELL,
          type: OrderType.MARKET,
          symbol: pair,
          quantity: String(
            hasLongPosition ? quantity - positionSize : quantity
          ),
        })
        .then(() => {
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
                      quantity * quantityPercentage,
                      quantityPrecision
                    )
                  ),
                })
                .catch(error);
            });
          }

          if (stopLoss) {
            if (takeProfits.length > 1) {
              binanceClient
                .futuresOrder({
                  side: OrderSide.BUY,
                  type: OrderType.STOP_MARKET,
                  symbol: pair,
                  stopPrice: stopLoss,
                  closePosition: 'true',
                })
                .catch(error);
            } else {
              binanceClient
                .futuresOrder({
                  side: OrderSide.BUY,
                  type: OrderType.STOP,
                  symbol: pair,
                  stopPrice: stopLoss,
                  price: stopLoss,
                  quantity: String(quantity),
                })
                .catch(error);
            }
          }

          logBuySellExecutionOrder(
            OrderSide.SELL,
            asset,
            base,
            currentPrice,
            quantity,
            takeProfits,
            stopLoss
          );
        })
        .catch(error);
    }
  }

  /**
   * Check if a position has been closed
   * @param pair
   */
  private async manageOpenOrders(pair: string) {
    this.accountInfo = await binanceClient.futuresAccountInfo();
    const position = this.accountInfo.positions.find(
      (position) => position.symbol === pair
    );
    const hasOpenPosition = Number(position.positionAmt) !== 0;

    if (this.hasOpenPosition[pair] && !hasOpenPosition) {
      this.hasOpenPosition[pair] = false;
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

  /**
   * Send the results of the day to the telegram channel
   */
  private sendDailyResult() {
    let performance = decimalFloor(
      ((this.currentBalance - this.lastDayBalance) / this.lastDayBalance) * 100,
      2
    );

    let emoji = performance >= 0 ? '🟢' : '🔴';
    let message = `Day result: ${
      performance > 0 ? `<b>+${performance}%</b>` : `${performance}%`
    } ${emoji}`;

    sendTelegramMessage(message);
  }

  /**
   * Send the results of the month to the telegram channel
   */
  private sendMonthResult() {
    let performance = decimalFloor(
      ((this.currentBalance - this.lastMonthBalance) / this.lastMonthBalance) *
        100,
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
      `<b>MONTH RESULT - ${this.currentMonth}</b>` +
      '\n' +
      `${performance > 0 ? `+${performance}%` : `${performance}%`} ${emoji}`;

    sendTelegramMessage(message);
  }
}
