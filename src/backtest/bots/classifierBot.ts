import { KNNClassifier } from '@tensorflow-models/knn-classifier';
import { tensor } from '@tensorflow/tfjs-core';
import { ExchangeInfo } from 'binance-api-node';
import { calculateIndicatorsForLastCandle } from '../../ml/knn/indicators';
import { PREDICTION_THRESHOLD } from '../../ml/knn/loadConfig';
import { BasicBackTestBot } from './basicBot';

/**
 * Extended class with a Knn classifier
 */
export class ClassifierBot extends BasicBackTestBot {
  private classifier: KNNClassifier;

  constructor(
    strategyConfigs: StrategyConfig[],
    strategyName: string,
    startDate: Date,
    endDate: Date,
    initialCapital: number,
    classifier: KNNClassifier
  ) {
    super(strategyConfigs, strategyName, startDate, endDate, initialCapital);
    this.classifier = classifier;
  }

  protected update(
    config: StrategyConfig,
    currentPrice: number,
    candles: CandlesDataMultiTimeFrames,
    exchangeInfo: ExchangeInfo
  ) {
    const { asset, base } = config;
    const pair = config.asset + config.base;

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
    // Position information
    // const positions = this.futuresWallet.positions;
    // const position = positions.find(
    //   (position) => position.pair === strategyConfig.asset + strategyConfig.base
    // );

    // const indicators = calculateIndicatorsForLastCandle(
    //   candles[strategyConfig.loopInterval]
    // );

    // const features = tensor(indicators);

    // this.classifier.predictClass(features).then(({ label, confidences }) => {
    //   // Take only decision if the probability is high
    //   if (confidences[label] > PREDICTION_THRESHOLD) {
    //     return {
    //       isBuySignal: Number(label) === 1,
    //       isSellSignal: Number(label) === -1,
    //       closePosition: false,
    //     };
    //   } else {
    //     return {
    //       isBuySignal: false,
    //       isSellSignal: false,
    //       closePosition: false,
    //     };
    //   }
    // });

    return {
      isBuySignal: false,
      isSellSignal: false,
      closePosition: false,
    };
  }
}
