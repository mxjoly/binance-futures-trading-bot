import { ExchangeInfo } from 'binance-api-node';
import { BINANCE_MODE } from '../../init';
import Genome from '../../ml/neat/core/genome';
import { calculateIndicators } from '../../ml/neat/indicators';
import {
  CANDLE_LENGTH_INPUTS,
  CANDLE_SOURCE,
  NEURAL_NETWORK_INPUTS_MODE,
} from '../../ml/neat/loadConfig';
import { normalize } from '../../utils/math';
import { BasicBackTestBot } from './basicBot';

/**
 * Extended class with a brain
 */
export class NeuralNetworkBot extends BasicBackTestBot {
  private brain: Genome;
  private vision: number[] = [];
  private decision: number[] = [];

  constructor(
    strategyConfigs: StrategyConfig[],
    strategyName: string,
    startDate: Date,
    endDate: Date,
    initialCapital: number,
    brain: Genome
  ) {
    super(strategyConfigs, strategyName, startDate, endDate, initialCapital);
    this.brain = brain;
  }

  protected update(
    config: StrategyConfig,
    currentPrice: number,
    candles: CandlesDataMultiTimeFrames,
    exchangeInfo: ExchangeInfo
  ) {
    const { asset, base, loopInterval } = config;
    const pair = config.asset + config.base;
    let candlesStream: CandleData[] = candles[pair][loopInterval];

    // Use neural network
    if (this.brain) {
      this.look(config, candlesStream);
      this.think();
    }

    this.tradeWithFutures(config, currentPrice, candles[pair], exchangeInfo);
    this.updatePNL(asset, base, currentPrice);
  }

  protected takeDecision(
    strategyConfig: StrategyConfig,
    candles: CandlesDataMultiTimeFrames
  ): {
    isBuySignal: boolean;
    isSellSignal: boolean;
    closePosition: boolean;
  } {
    const { buyStrategy, sellStrategy, asset, base } = strategyConfig;

    const positions = this.futuresWallet.positions;
    const position = positions.find(
      (position) => position.pair === asset + base
    );
    const hasLongPosition = position.size > 0;
    const hasShortPosition = position.size < 0;

    let max = Math.max(...this.decision);
    const isBuySignal = this.brain
      ? max === this.decision[0] && this.decision[0] > 0.6 && !hasShortPosition
      : buyStrategy(candles);
    const isSellSignal = this.brain
      ? max === this.decision[1] && this.decision[1] > 0.6 && !hasLongPosition
      : sellStrategy(candles);
    const closePosition = this.brain
      ? max === this.decision[2] &&
        this.decision[2] > 0.6 &&
        (hasShortPosition || hasLongPosition)
      : false;

    return { isBuySignal, isSellSignal, closePosition };
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
   * Get the inputs for the neural network
   * @param strategyConfig
   * @param candles
   */
  public look(strategyConfig: StrategyConfig, candles: CandleData[]) {
    let vision: number[] = [];

    // If not exit strategy, we add an input to know if the player hold a position
    if (!strategyConfig.exitStrategy && BINANCE_MODE === 'futures') {
      const position = this.futuresWallet.positions.find(
        (pos) => pos.pair === strategyConfig.asset + strategyConfig.base
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
      let indicatorVision = calculateIndicators(candles).map(
        (v) => v.slice(-1)[0]
      );
      // Add to the array
      vision = vision.concat(indicatorVision);
    }

    this.vision = vision;
  }
}
