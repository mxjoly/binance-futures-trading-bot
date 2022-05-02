import { CandleChartInterval } from 'binance-api-node';
import atrTpslStrategy from '../strategies/exit/atr';
import { VOLUME_OSCILLATOR } from '../strategies/entry';
import { threeEma } from '../strategies/trend';
import { getPositionSizeByRisk } from '../strategies/riskManagement';
import { MAX_LOADED_CANDLE_LENGTH_API } from '../init';

export const hyperParameters: HyperParameters = {
  takeProfitAtrRatio: { value: 3, optimization: [1, 3] },
  stopLossAtrRatio: { value: 1, optimization: [1, 3] },
  atrPeriod: { value: 10 },
  atrMultiplier: { value: 2 },
  emaShortPeriod: { value: 9 },
  emaMediumPeriod: { value: 14 },
  emaLongPeriod: { value: 21 },
  volOscLongLength: { value: 10 },
  volOscShortLength: { value: 5 },
  volOscThreshold: { value: 40 },
};

export const config: AbstractStrategyConfig = (parameters) => [
  {
    asset: 'BTC',
    base: 'USDT',
    loopInterval: CandleChartInterval.FIVE_MINUTES,
    indicatorIntervals: [CandleChartInterval.FIVE_MINUTES],
    risk: 0.01,
    leverage: 10,
    exitStrategy: (price, candles, pricePrecision, side) =>
      atrTpslStrategy(
        price,
        candles[CandleChartInterval.FIVE_MINUTES].slice(
          -MAX_LOADED_CANDLE_LENGTH_API
        ),
        pricePrecision,
        side,
        {
          takeProfitAtrRatio: parameters.takeProfitAtrRatio.value,
          stopLossAtrRatio: parameters.stopLossAtrRatio.value,
          atrPeriod: parameters.atrPeriod.value,
          atrMultiplier: parameters.atrMultiplier.value,
        }
      ),
    buyStrategy: (candles) =>
      VOLUME_OSCILLATOR.isBuySignal(
        candles[CandleChartInterval.FIVE_MINUTES].slice(
          -MAX_LOADED_CANDLE_LENGTH_API
        ),
        {
          longLength: parameters.volOscLongLength.value,
          shortLength: parameters.volOscShortLength.value,
          threshold: parameters.volOscThreshold.value,
        }
      ),
    sellStrategy: (candles) =>
      VOLUME_OSCILLATOR.isSellSignal(
        candles[CandleChartInterval.FIVE_MINUTES].slice(
          -MAX_LOADED_CANDLE_LENGTH_API
        ),
        {
          longLength: parameters.volOscLongLength.value,
          shortLength: parameters.volOscShortLength.value,
          threshold: parameters.volOscThreshold.value,
        }
      ),
    trendFilter: (candles) =>
      threeEma.getTrend(
        candles[CandleChartInterval.FIVE_MINUTES].slice(
          -MAX_LOADED_CANDLE_LENGTH_API
        ),
        {
          emaShortPeriod: parameters.emaShortPeriod.value,
          emaMediumPeriod: parameters.emaMediumPeriod.value,
          emaLongPeriod: parameters.emaLongPeriod.value,
        }
      ),
    riskManagement: getPositionSizeByRisk,
  },
];
