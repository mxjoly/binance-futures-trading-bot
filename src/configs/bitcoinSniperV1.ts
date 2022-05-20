import { CandleChartInterval } from 'binance-api-node';
import { tickExitStrategy } from '../strategies/exit';
import { Complex } from '../strategies/entry';
import { getPositionSizeByRisk } from '../strategies/riskManagement';

const hyperParameters_BTCBUSD = {
  adxType: { value: 'CLASSIC' },
  adxLength: { value: 33 },
  adxThreshold: { value: 10 },
  supportResistanceLeftBars: { value: 6 },
  supportResistanceRightBars: { value: 8 },
  volumeMultiplier: { value: 1.4 },
  volumeLength: { value: 26 },
  psarStep: { value: 0.2 },
  psarMax: { value: 0.1 },
  rangeFilterSourceType: { value: 'open' },
  rangeFilterPeriod: { value: 9 },
  rangeFilterMultiplier: { value: 1.4 },
  macdFastLength: { value: 11 },
  macdSlowLength: { value: 16 },
  macdSourceType: { value: 'open' },
  macdSignalLength: { value: 20 },
  rsiLength: { value: 55 },
  rsiSourceType: { value: 'open' },
  momentumLength: { value: 10 },
  momentumTmoLength: { value: 3 },
  momentumSmoothLength: { value: 6 },
  maLength: { value: 16 },
  maSourceType: { value: 'open' },
  jmaLength: { value: 14 },
  jmaSourceType: { value: 'low' },
  emaScalpingLength: { value: 3 },
  scalpingFastEmaLength: { value: 10 },
  scalpingMediumEmaLength: { value: 120 },
  scalpingSlowEmaLength: { value: 250 },
  scalpingLookBack: { value: 12 },
  scalpingUseHeikinAshiCandles: { value: true },
  rmiLength: { value: 33 },
  rmiSourceType: { value: 'close' },
  rmiMomentumLength: { value: 15 },
  rmiOversold: { value: 44 },
  rmiOverbought: { value: 59 },
  bollingerBandsLength: { value: 10 },
  bollingerBandsSourceType: { value: 'high' },
  bollingerBandsMultiplier: { value: 2 },
  tpLongPercent: { value: 0.014 },
  tpShortPercent: { value: 0.013 },
  slPercent: { value: 0.055 },
};

const hyperParameters_BTCUSDT = {
  adxType: { value: 'MASANAKAMURA' },
  adxLength: { value: 33 },
  adxThreshold: { value: 12 },
  supportResistanceLeftBars: { value: 7 },
  supportResistanceRightBars: { value: 8 },
  volumeMultiplier: { value: 1.2 },
  volumeLength: { value: 24 },
  psarStep: { value: 0.2 },
  psarMax: { value: 0.1 },
  rangeFilterSourceType: { value: 'open' },
  rangeFilterPeriod: { value: 8 },
  rangeFilterMultiplier: { value: 1.4 },
  macdFastLength: { value: 15 },
  macdSlowLength: { value: 17 },
  macdSourceType: { value: 'open' },
  macdSignalLength: { value: 20 },
  rsiLength: { value: 55 },
  rsiSourceType: { value: 'low' },
  momentumLength: { value: 10 },
  momentumTmoLength: { value: 3 },
  momentumSmoothLength: { value: 21 },
  maLength: { value: 17 },
  maSourceType: { value: 'open' },
  jmaLength: { value: 14 },
  jmaSourceType: { value: 'low' },
  emaScalpingLength: { value: 3 },
  scalpingFastEmaLength: { value: 10 },
  scalpingMediumEmaLength: { value: 120 },
  scalpingSlowEmaLength: { value: 250 },
  scalpingLookBack: { value: 12 },
  scalpingUseHeikinAshiCandles: { value: true },
  rmiLength: { value: 33 },
  rmiSourceType: { value: 'close' },
  rmiMomentumLength: { value: 15 },
  rmiOversold: { value: 44 },
  rmiOverbought: { value: 62 },
  bollingerBandsLength: { value: 9 },
  bollingerBandsSourceType: { value: 'high' },
  bollingerBandsMultiplier: { value: 2 },
  tpLongPercent: { value: 0.009 },
  tpShortPercent: { value: 0.009 },
  slPercent: { value: 0.055 },
};

export const hyperParameters = hyperParameters_BTCUSDT;

export const config: AbstractStrategyConfig = (parameters) => [
  {
    asset: 'BTC',
    base: 'USDT',
    loopInterval: CandleChartInterval.ONE_HOUR,
    indicatorIntervals: [CandleChartInterval.ONE_HOUR],
    risk: 0.055,
    leverage: 10,
    unidirectional: false,
    canOpenNewPositionToCloseLast: true,
    exitStrategy: (price, candles, pricePrecision, side, exchangeInfo) =>
      tickExitStrategy(
        price,
        candles[CandleChartInterval.ONE_HOUR],
        pricePrecision,
        side,
        exchangeInfo,
        {
          lossTolerance: parameters.slPercent.value,
          profitTargets: [
            {
              quantityPercentage: 1,
              deltaPercentage: parameters.tpLongPercent.value,
            },
          ],
        }
      ),
    buyStrategy: (candles) =>
      Complex.BITCOIN_SNIPER_V1.isBuySignal(
        candles[CandleChartInterval.ONE_HOUR],
        {
          ...Object.entries(parameters).reduce(
            (prev, cur) => ({ [cur[0]]: cur[1].value, ...prev }),
            {}
          ),
        }
      ),
    sellStrategy: (candles) =>
      Complex.BITCOIN_SNIPER_V1.isSellSignal(
        candles[CandleChartInterval.ONE_HOUR],
        {
          ...Object.entries(parameters).reduce(
            (prev, cur) => ({ [cur[0]]: cur[1].value, ...prev }),
            {}
          ),
        }
      ),
    riskManagement: getPositionSizeByRisk,
  },
];
