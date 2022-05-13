import { PSAR, SMA as LibSMA } from 'technicalindicators';
import {
  AdxMasanaKamura,
  RSI,
  RangeBands,
  SMA,
  HMA,
  JMA,
  MACD,
  RMI,
  Scalping,
  SmoothAO,
  SmoothMomentum,
  SupportResistance,
  BollingerBands,
  VWMA,
  EMA,
} from '../../../indicators';

interface Options {
  adxLength?: number;
  adxThreshold?: number;
  supportResistanceLeftBars?: number;
  supportResistanceRightBars?: number;
  volumeMultiplier?: number;
  volumeLength?: number;
  psarStep?: number;
  psarMax?: number;
  rangeFilterSourceType?: SourceType;
  rangeFilterPeriod?: number;
  rangeFilterMultiplier?: number;
  macdFastLength?: number;
  macdSlowLength?: number;
  macdSignalLength?: number;
  macdSourceType?: SourceType;
  rsiLength?: number;
  rsiSourceType?: SourceType;
  momentumLength?: number;
  momentumTmoLength?: number;
  momentumSmoothLength?: number;
  maLength?: number;
  maSourceType?: SourceType;
  jmaLength?: number;
  jmaSourceType?: SourceType;
  emaScalpingLength?: number;
  scalpingFastEmaLength?: number;
  scalpingMediumEmaLength?: number;
  scalpingSlowEmaLength?: number;
  scalpingLookBack?: number;
  scalpingUseHeikinAshiCandles?: true;
  rmiLength?: number;
  rmiSourceType?: SourceType;
  rmiMomentumLength?: number;
  rmiOversold?: number;
  rmiOverbought?: number;
  bollingerBandsLength?: number;
  bollingerBandsSourceType?: SourceType;
  bollingerBandsMultiplier?: number;
  tpLongPercent?: number;
  tpShortPercent?: number;
  slPercent?: number;
}

const defaultOptions: Options = {
  adxLength: 33,
  adxThreshold: 12,
  supportResistanceLeftBars: 7,
  supportResistanceRightBars: 8,
  volumeMultiplier: 1.2,
  volumeLength: 24,
  psarStep: 0.2,
  psarMax: 0.1,
  rangeFilterSourceType: 'open',
  rangeFilterPeriod: 8,
  rangeFilterMultiplier: 1.4,
  macdFastLength: 15,
  macdSlowLength: 17,
  macdSourceType: 'open',
  macdSignalLength: 20,
  rsiLength: 55,
  rsiSourceType: 'low',
  momentumLength: 10,
  momentumTmoLength: 3,
  momentumSmoothLength: 21,
  maLength: 17,
  maSourceType: 'open',
  jmaLength: 14,
  jmaSourceType: 'low',
  emaScalpingLength: 3,
  scalpingFastEmaLength: 10,
  scalpingMediumEmaLength: 120,
  scalpingSlowEmaLength: 250,
  scalpingLookBack: 12,
  scalpingUseHeikinAshiCandles: true,
  rmiLength: 33,
  rmiSourceType: 'close',
  rmiMomentumLength: 15,
  rmiOversold: 44,
  rmiOverbought: 62,
  bollingerBandsLength: 9,
  bollingerBandsSourceType: 'high',
  bollingerBandsMultiplier: 2,
  tpLongPercent: 0.009,
  tpShortPercent: 0.009,
  slPercent: 0.055,
};

const adxCondition = (
  candles: CandleData[],
  {
    adxLength = defaultOptions.adxLength,
    adxThreshold = defaultOptions.adxThreshold,
  }
) => {
  let { DIM, DIP, adx } = AdxMasanaKamura.calculate(candles, {
    atrLength: adxLength,
  }).slice(-1)[0];

  let adxLongCond = DIP > DIM && adx > adxThreshold;
  let adxShortCond = DIP < DIM && adx > adxThreshold;
  return { adxLongCond, adxShortCond };
};

const psarCondition = (
  candles: CandleData[],
  { psarStep = defaultOptions.psarStep, psarMax = defaultOptions.psarMax }
) => {
  let psar = PSAR.calculate({
    high: candles.map((c) => c.high),
    low: candles.map((c) => c.low),
    max: psarMax,
    step: psarStep,
  }).slice(-1)[0];

  let psarLongCond = psar < candles[candles.length - 1].close;
  let psarShortCond = psar > candles[candles.length - 1].close;
  return { psarLongCond, psarShortCond };
};

const supportResistanceCondition = (
  candles: CandleData[],
  {
    leftBars = defaultOptions.supportResistanceLeftBars,
    rightBars = defaultOptions.supportResistanceRightBars,
  }
) => {
  let sr = SupportResistance.calculate(candles, {
    leftBars,
    rightBars,
  }).slice(-2);

  let curClose = candles[candles.length - 1].close;
  let prevClose = candles[candles.length - 2].close;
  let srLongCond = curClose > sr[1].top;
  let srShortCond = curClose < sr[1].bottom;
  let srLongCross = prevClose < sr[0].top && curClose > sr[1].top;
  let srShortCross = prevClose > sr[0].bottom && curClose < sr[1].bottom;
  return { srLongCond, srShortCond, srLongCross, srShortCross, sr: sr[1] };
};

const volumeCondition = (
  candles: CandleData[],
  {
    volumeLength = defaultOptions.volumeLength,
    volumeMultiplier = defaultOptions.volumeMultiplier,
  }
) => {
  let ma = SMA.calculate(candles, {
    sourceType: 'volume',
    period: volumeLength,
  }).map((v) => v * volumeMultiplier);

  return candles[candles.length - 1].volume > ma[ma.length - 1];
};

const rangeFilterCondition = (
  candles: CandleData[],
  {
    rangeFilterSourceType = defaultOptions.rangeFilterSourceType,
    rangeFilterPeriod = defaultOptions.rangeFilterPeriod,
    rangeFilterMultiplier = defaultOptions.rangeFilterMultiplier,
  }
) => {
  let { highBand, lowBand, upward, downward } = RangeBands.calculate(candles, {
    multiplier: rangeFilterMultiplier,
    sourceType: rangeFilterSourceType,
    period: rangeFilterPeriod,
  }).slice(-1)[0];

  let rangeFilterLongCond =
    candles[candles.length - 1].high > highBand && upward > 0;
  let rangeFilterShortCond =
    candles[candles.length - 1].low < lowBand && downward > 0;
  return {
    rangeFilterLongCond,
    rangeFilterShortCond,
  };
};

const macdCondition = (
  candles: CandleData[],
  {
    fastLength = defaultOptions.macdFastLength,
    slowLength = defaultOptions.macdSlowLength,
    signalLength = defaultOptions.macdSignalLength,
    sourceType = defaultOptions.macdSourceType,
  }
) => {
  let { macd, signal } = MACD.calculate(candles, {
    fastLength,
    slowLength,
    signalLength,
    sourceType,
    signalMaType: 'SMA',
  }).slice(-1)[0];

  return {
    macdLongCond: macd > signal,
    macdShortCond: macd < signal,
  };
};

const rsiCondition = (
  candles: CandleData[],
  {
    period = defaultOptions.rsiLength,
    sourceType = defaultOptions.rsiSourceType,
  }
) => {
  let value = RSI.calculate(candles, { period, sourceType }).slice(-1)[0];

  return { rsiLongCond: value < 70, rsiShortCond: value > 30 };
};

const momentumCondition = (
  candles: CandleData[],
  {
    tmoLength = defaultOptions.momentumTmoLength,
    smoothLength = defaultOptions.momentumSmoothLength,
    length = defaultOptions.momentumLength,
  }
) => {
  let { main, signal } = SmoothMomentum.calculate(candles, {
    tmoLength,
    smoothLength,
    length,
  }).slice(-1)[0];

  return { momentumLongCond: main > signal, momentumShortCond: main < signal };
};

const maCondition = (
  candles: CandleData[],
  { length = defaultOptions.maLength, sourceType = defaultOptions.maSourceType }
) => {
  let vwma = VWMA.calculate(candles, { period: length, sourceType }).slice(-2);
  let maSpeed = (vwma[1] / vwma[0] - 1) * 100;

  return { maLongCond: maSpeed > 0, maShortCond: maSpeed < 0 };
};

const jmaCondition = (
  candles: CandleData[],
  {
    length = defaultOptions.jmaLength,
    sourceType = defaultOptions.jmaSourceType,
  }
) => {
  let jma = JMA.calculate(candles, { period: length, sourceType }).slice(-1)[0];
  let low = candles[candles.length - 2].low;
  let signal = low > jma ? 1 : low < jma ? -1 : 0;

  return { jmaLongCond: signal > 0, jmaShortCond: signal < 0 };
};

const scalpingCondition = (
  candles: CandleData[],
  {
    emaScalpingLength = defaultOptions.emaScalpingLength,
    useHeikinAshiCandles = defaultOptions.scalpingUseHeikinAshiCandles,
    fastEmaLength = defaultOptions.scalpingFastEmaLength,
    mediumEmaLength = defaultOptions.scalpingMediumEmaLength,
    slowEmaLength = defaultOptions.scalpingSlowEmaLength,
    lookBack = defaultOptions.scalpingLookBack,
  }
) => {
  let tradeDirection = Scalping.calculate(candles, {
    emaScalpingLength,
    useHeikinAshiCandles,
    fastEmaLength,
    mediumEmaLength,
    slowEmaLength,
    lookBack,
  }).slice(-2);
  return {
    scalpingLongSignal: tradeDirection[0] === 0 && tradeDirection[1] === 1,
    scalpingShortSignal: tradeDirection[0] === 0 && tradeDirection[1] === -1,
  };
};

const rmiCondition = (
  candles: CandleData[],
  {
    rmiLength = defaultOptions.rmiLength,
    rmiMomentumLength = defaultOptions.rmiMomentumLength,
    rmiOversold = defaultOptions.rmiOversold,
    rmiOverbought = defaultOptions.rmiOverbought,
    rmiSourceType = defaultOptions.rmiSourceType,
  }
) => {
  let rmi = RMI.calculate(candles, {
    length: rmiLength,
    momentum: rmiMomentumLength,
    sourceType: rmiSourceType,
  }).slice(-2);

  let longSignal = rmi[0] < rmiOversold && rmi[1] > rmiOversold;
  let shortSignal = rmi[0] > rmiOverbought && rmi[1] < rmiOverbought;
  return { rmiLongSignal: longSignal, rmiShortSignal: shortSignal };
};

const bollingerBandsCondition = (
  candles: CandleData[],
  {
    bollingerBandsLength = defaultOptions.bollingerBandsLength,
    bollingerBandsSourceType = defaultOptions.bollingerBandsSourceType,
    bollingerBandsMultiplier = defaultOptions.bollingerBandsMultiplier,
  }
) => {
  let bb = BollingerBands.calculate(candles, {
    period: bollingerBandsLength,
    sourceType: bollingerBandsSourceType,
    multiplier: bollingerBandsMultiplier,
  });

  let prevBB = bb[bb.length - 2];
  let curBB = bb[bb.length - 1];

  let fastMax = EMA.calculate(candles, {
    period: 6,
    sourceType: bollingerBandsSourceType,
  });

  let ao = SmoothAO.calculate(candles, {
    fastLength: 6,
    slowLength: 16,
    sourceType: 'hl2',
  }).slice(-1)[0];

  let sqzFilter = true;
  let sqzLength = 120;
  let sqzThreshold = 50;

  let avgSpread = LibSMA.calculate({
    period: sqzLength,
    values: bb.map((v) => v.spread),
  }).slice(-1)[0];

  let bbSqueeze = (curBB.spread / avgSpread) * 100;

  let bbLongSignal =
    fastMax[fastMax.length - 2] < prevBB.basis &&
    fastMax[fastMax.length - 1] > curBB.basis &&
    candles[candles.length - 1].close > curBB.basis &&
    Math.abs(ao) === 1 &&
    (!sqzFilter || bbSqueeze > sqzThreshold);

  let bbShortSignal =
    fastMax[fastMax.length - 2] > prevBB.basis &&
    fastMax[fastMax.length - 1] < curBB.basis &&
    candles[candles.length - 1].close < curBB.basis &&
    Math.abs(ao) === 2 &&
    (!sqzFilter || bbSqueeze > sqzThreshold);

  return { bbLongSignal, bbShortSignal };
};

export const isBuySignal = (candles: CandleData[], options?: Options) => {
  options = { ...defaultOptions, ...options };

  let { adxLongCond } = adxCondition(candles, {
    adxLength: options.adxLength,
    adxThreshold: options.adxThreshold,
  });
  let { psarLongCond } = psarCondition(candles, {
    psarMax: options.psarMax,
    psarStep: options.psarStep,
  });
  let { srLongCond, sr, srLongCross, srShortCross } =
    supportResistanceCondition(candles, {
      leftBars: options.supportResistanceLeftBars,
      rightBars: options.supportResistanceRightBars,
    });
  let volCond = volumeCondition(candles, {
    volumeLength: options.volumeLength,
    volumeMultiplier: options.volumeMultiplier,
  });
  let { rangeFilterLongCond } = rangeFilterCondition(candles, {
    rangeFilterSourceType: options.rangeFilterSourceType,
    rangeFilterMultiplier: options.rangeFilterMultiplier,
    rangeFilterPeriod: options.rangeFilterPeriod,
  });
  let { macdLongCond } = macdCondition(candles, {
    fastLength: options.macdFastLength,
    slowLength: options.macdSlowLength,
    signalLength: options.macdSignalLength,
    sourceType: options.macdSourceType,
  });
  let { rsiLongCond } = rsiCondition(candles, {
    period: options.rsiLength,
    sourceType: options.rsiSourceType,
  });
  let { momentumLongCond } = momentumCondition(candles, {
    length: options.momentumLength,
    smoothLength: options.momentumSmoothLength,
    tmoLength: options.momentumTmoLength,
  });
  let { maLongCond } = maCondition(candles, {
    length: options.maLength,
    sourceType: options.maSourceType,
  });
  let { jmaLongCond } = jmaCondition(candles, {
    length: options.jmaLength,
    sourceType: options.jmaSourceType,
  });
  let { scalpingLongSignal } = scalpingCondition(candles, {
    emaScalpingLength: options.emaScalpingLength,
    fastEmaLength: options.scalpingFastEmaLength,
    mediumEmaLength: options.scalpingMediumEmaLength,
    slowEmaLength: options.scalpingSlowEmaLength,
    lookBack: options.scalpingLookBack,
    useHeikinAshiCandles: options.scalpingUseHeikinAshiCandles,
  });
  let { rmiLongSignal } = rmiCondition(candles, {
    rmiLength: options.rmiLength,
    rmiMomentumLength: options.rmiMomentumLength,
    rmiSourceType: options.rmiSourceType,
    rmiOverbought: options.rmiOverbought,
    rmiOversold: options.rmiOversold,
  });
  let { bbLongSignal } = bollingerBandsCondition(candles, {
    bollingerBandsLength: options.bollingerBandsLength,
    bollingerBandsMultiplier: options.bollingerBandsMultiplier,
    bollingerBandsSourceType: options.bollingerBandsSourceType,
  });

  let longCondition1 =
    srLongCond &&
    adxLongCond &&
    psarLongCond &&
    rangeFilterLongCond &&
    macdLongCond &&
    rsiLongCond &&
    momentumLongCond &&
    maLongCond &&
    jmaLongCond &&
    volCond;

  let longCondition2 =
    scalpingLongSignal &&
    adxLongCond &&
    rangeFilterLongCond &&
    macdLongCond &&
    rsiLongCond &&
    momentumLongCond;

  let longCondition3 =
    rmiLongSignal &&
    rangeFilterLongCond &&
    adxLongCond &&
    momentumLongCond &&
    psarLongCond;

  let longCondition4 =
    bbLongSignal &&
    rangeFilterLongCond &&
    adxLongCond &&
    momentumLongCond &&
    rsiLongCond &&
    maLongCond;

  return longCondition1 || longCondition2 || longCondition3 || longCondition4;
};

export const isSellSignal = (candles: CandleData[], options?: Options) => {
  options = { ...defaultOptions, ...options };

  let { adxShortCond } = adxCondition(candles, {
    adxLength: options.adxLength,
    adxThreshold: options.adxThreshold,
  });
  let { psarShortCond } = psarCondition(candles, {
    psarMax: options.psarMax,
    psarStep: options.psarStep,
  });
  let { srShortCond, sr, srLongCross, srShortCross } =
    supportResistanceCondition(candles, {
      leftBars: options.supportResistanceLeftBars,
      rightBars: options.supportResistanceRightBars,
    });
  let volCond = volumeCondition(candles, {
    volumeLength: options.volumeLength,
    volumeMultiplier: options.volumeMultiplier,
  });
  let { rangeFilterShortCond } = rangeFilterCondition(candles, {
    rangeFilterSourceType: options.rangeFilterSourceType,
    rangeFilterMultiplier: options.rangeFilterMultiplier,
    rangeFilterPeriod: options.rangeFilterPeriod,
  });
  let { macdShortCond } = macdCondition(candles, {
    fastLength: options.macdFastLength,
    slowLength: options.macdSlowLength,
    signalLength: options.macdSignalLength,
    sourceType: options.macdSourceType,
  });
  let { rsiShortCond } = rsiCondition(candles, {
    period: options.rsiLength,
    sourceType: options.rsiSourceType,
  });
  let { momentumShortCond } = momentumCondition(candles, {
    length: options.momentumLength,
    smoothLength: options.momentumSmoothLength,
    tmoLength: options.momentumTmoLength,
  });
  let { maShortCond } = maCondition(candles, {
    length: options.maLength,
    sourceType: options.maSourceType,
  });
  let { jmaShortCond } = jmaCondition(candles, {
    length: options.jmaLength,
    sourceType: options.jmaSourceType,
  });
  let { scalpingShortSignal } = scalpingCondition(candles, {
    emaScalpingLength: options.emaScalpingLength,
    fastEmaLength: options.scalpingFastEmaLength,
    mediumEmaLength: options.scalpingMediumEmaLength,
    slowEmaLength: options.scalpingSlowEmaLength,
    lookBack: options.scalpingLookBack,
    useHeikinAshiCandles: options.scalpingUseHeikinAshiCandles,
  });
  let { rmiShortSignal } = rmiCondition(candles, {
    rmiLength: options.rmiLength,
    rmiMomentumLength: options.rmiMomentumLength,
    rmiSourceType: options.rmiSourceType,
    rmiOverbought: options.rmiOverbought,
    rmiOversold: options.rmiOversold,
  });
  let { bbShortSignal } = bollingerBandsCondition(candles, {
    bollingerBandsLength: options.bollingerBandsLength,
    bollingerBandsMultiplier: options.bollingerBandsMultiplier,
    bollingerBandsSourceType: options.bollingerBandsSourceType,
  });

  let shortCondition1 =
    srShortCond &&
    adxShortCond &&
    psarShortCond &&
    rangeFilterShortCond &&
    macdShortCond &&
    rsiShortCond &&
    momentumShortCond &&
    maShortCond &&
    jmaShortCond &&
    volCond;

  let shortCondition2 =
    scalpingShortSignal &&
    adxShortCond &&
    rangeFilterShortCond &&
    macdShortCond &&
    rsiShortCond &&
    momentumShortCond;

  let shortCondition3 =
    rmiShortSignal &&
    rangeFilterShortCond &&
    adxShortCond &&
    momentumShortCond &&
    psarShortCond;

  let shortCondition4 =
    bbShortSignal &&
    rangeFilterShortCond &&
    adxShortCond &&
    momentumShortCond &&
    rsiShortCond &&
    maShortCond;

  return (
    shortCondition1 || shortCondition2 || shortCondition3 || shortCondition4
  );
};
