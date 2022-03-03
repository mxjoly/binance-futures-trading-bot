import { BotConfig } from '../init';
import { NeuralNetwork } from '../lib/neuralNetwork';
import { calculate } from '../indicators/volumeOscillator';
import {
  ADX,
  AwesomeOscillator,
  CCI,
  EMA,
  IchimokuCloud,
  MFI,
  ROC,
  RSI,
  VWAP,
  WilliamsR,
} from 'technicalindicators';

const GeneticConfig = BotConfig['genetic'];
const NeuralNetworkConfig = GeneticConfig['neural_network'];
const IndicatorInputsConfig = NeuralNetworkConfig['indicator_inputs'];

// Configure the inputs of the neural network
const NEURAL_NETWORK_INPUTS = {
  EMA21: IndicatorInputsConfig['EMA21'] || false,
  EMA50: IndicatorInputsConfig['EMA50'] || false,
  EMA100: IndicatorInputsConfig['EMA100'] || false,
  ADX: IndicatorInputsConfig['ADX'] || false,
  AO: IndicatorInputsConfig['AO'] || false,
  CCI: IndicatorInputsConfig['CCI'] || false,
  MFI: IndicatorInputsConfig['MFI'] || false,
  ROC: IndicatorInputsConfig['ROC'] || false,
  RSI: IndicatorInputsConfig['RSI'] || false,
  WILLIAM_R: IndicatorInputsConfig['WILLIAM_R'] || false,
  KIJUN: IndicatorInputsConfig['KIJUN'] || false,
  VWAP: IndicatorInputsConfig['VWAP'] || false,
  VOL_OSC: IndicatorInputsConfig['VOL_OSC'] || false,
  PRICE_CHANGE: IndicatorInputsConfig['PRICE_CHANGE'] || false,
  VOL: IndicatorInputsConfig['VOL'] || false,
};

export const NUMBER_INPUTS = Object.entries(NEURAL_NETWORK_INPUTS).filter(
  ([, val]) => val === true
).length;

export const NUMBER_HIDDEN_NODES = NUMBER_INPUTS;

export const NUMBER_OUTPUTS = 2;

/**
 * Generate the inputs of neural network from indicators
 * @param pair
 * @param candles
 * @param extra
 * @param useExitStrategy
 */
export function getInputs(
  pair: string,
  candles: CandleData[],
  extra: { wallet?: Wallet; futuresWallet?: FuturesWallet },
  useExitStrategy = false
) {
  // EMA21
  const ema21 =
    NEURAL_NETWORK_INPUTS.EMA21 === true
      ? EMA.calculate({
          period: 21,
          values: candles.map((c) => c.close).slice(-21),
        }).slice(-1)[0]
      : null;

  // EMA50
  const ema50 = NEURAL_NETWORK_INPUTS.EMA50
    ? EMA.calculate({
        period: 50,
        values: candles.map((c) => c.close).slice(-50),
      }).slice(-1)[0]
    : null;

  // EMA100
  const ema100 = NEURAL_NETWORK_INPUTS.EMA100
    ? EMA.calculate({
        period: 100,
        values: candles.map((c) => c.close).slice(-100),
      }).slice(-1)[0]
    : null;

  // Average Directional Index
  const adx = NEURAL_NETWORK_INPUTS.ADX
    ? ADX.calculate({
        period: 14,
        close: candles.map((c) => c.close).slice(-28),
        high: candles.map((c) => c.high).slice(-28),
        low: candles.map((c) => c.low).slice(-28),
      }).slice(-1)[0].adx
    : null;

  // Awesome Indicator
  const ao = NEURAL_NETWORK_INPUTS.AO
    ? AwesomeOscillator.calculate({
        fastPeriod: 5,
        slowPeriod: 25,
        high: candles.map((c) => c.high).slice(-26),
        low: candles.map((c) => c.low).slice(-26),
      }).slice(-1)[0]
    : null;

  // Commodity Channel Index
  const cci = NEURAL_NETWORK_INPUTS.CCI
    ? CCI.calculate({
        period: 20,
        close: candles.map((c) => c.close).slice(-21),
        high: candles.map((c) => c.high).slice(-21),
        low: candles.map((c) => c.low).slice(-21),
      }).slice(-1)[0]
    : null;

  // Money Flow Index
  const mfi = NEURAL_NETWORK_INPUTS.MFI
    ? MFI.calculate({
        period: 14,
        volume: candles.map((c) => c.volume).slice(-15),
        close: candles.map((c) => c.close).slice(-15),
        high: candles.map((c) => c.high).slice(-15),
        low: candles.map((c) => c.low).slice(-15),
      }).slice(-1)[0]
    : null;

  // Rate of Change
  const roc = NEURAL_NETWORK_INPUTS.ROC
    ? ROC.calculate({
        period: 9,
        values: candles.map((c) => c.close).slice(-10),
      }).slice(-1)[0]
    : null;

  // Relative Strengh Index
  const rsi = NEURAL_NETWORK_INPUTS.RSI
    ? RSI.calculate({
        period: 14,
        values: candles.map((c) => c.close).slice(-15),
      }).slice(-1)[0]
    : null;

  // William R
  const williamR = NEURAL_NETWORK_INPUTS.WILLIAM_R
    ? WilliamsR.calculate({
        period: 14,
        close: candles.map((c) => c.close).slice(-15),
        high: candles.map((c) => c.high).slice(-15),
        low: candles.map((c) => c.low).slice(-15),
      }).slice(-1)[0]
    : null;

  // Ichimoku
  const kijun = NEURAL_NETWORK_INPUTS.KIJUN
    ? IchimokuCloud.calculate({
        conversionPeriod: 9,
        basePeriod: 26,
        spanPeriod: 52,
        displacement: 26,
        high: candles.map((c) => c.high).slice(-53),
        low: candles.map((c) => c.low).slice(-53),
      }).slice(-1)[0].base
    : null;

  // Volume Weighted Average Price
  const vwap = NEURAL_NETWORK_INPUTS.VWAP
    ? VWAP.calculate({
        close: [candles[candles.length - 1].close],
        high: [candles[candles.length - 1].high],
        low: [candles[candles.length - 1].low],
        volume: [candles[candles.length - 1].volume],
      }).slice(-1)[0]
    : null;

  // Oscillator volume
  const volOsc = NEURAL_NETWORK_INPUTS.VOL_OSC
    ? calculate({
        shortLength: 5,
        longLength: 10,
        candles: candles.slice(-11),
      }).slice(-1)[0]
    : null;

  // Trading volume
  const vol = NEURAL_NETWORK_INPUTS.VOL
    ? candles[candles.length - 1].volume
    : null;

  // Price change
  const currentPrice = candles[candles.length - 1].close;
  const olderPrice = candles[candles.length - 10].close;
  const priceChange = NEURAL_NETWORK_INPUTS.PRICE_CHANGE
    ? (currentPrice - olderPrice) / olderPrice
    : null;

  // Currently holding a trade/position?
  let holdingTrade = false;
  // Only if the robot doesn't have an exit strategy predefined
  if (!useExitStrategy) {
    if (extra.wallet) {
      const balance = extra.wallet.balances.find((bal) => bal.symbol === pair);
      holdingTrade = balance.quantity > 0;
    }
    if (extra.futuresWallet) {
      const position = extra.futuresWallet.positions.find(
        (pos) => pos.pair === pair
      );
      holdingTrade = position.size !== 0;
    }
  }

  // Inputs for the neural network
  let inputs = [
    ema21,
    ema50,
    ema100,
    adx,
    ao,
    cci,
    mfi,
    roc,
    rsi,
    williamR,
    vwap,
    kijun,
    volOsc,
    vol,
    priceChange,
    useExitStrategy ? null : holdingTrade ? 1 : 0,
  ].filter((i) => i !== null);

  return inputs;
}

/**
 * Function to get the outputs of the neural network according to the inputs
 * @param pair
 * @param candles
 * @param brain
 * @param extra
 * @param useExitStrategy
 */
export function getOutputs(
  pair: string,
  candles: CandleData[],
  brain: NeuralNetwork,
  extra: { wallet?: Wallet; futuresWallet?: FuturesWallet },
  useExitStrategy = false
) {
  // We need at maximum 100 candles to calculate all the indicators value for the inputs
  if (candles.length < 100) return;

  // Get the inputs
  let inputs = getInputs(pair, candles, extra, useExitStrategy);

  // Get the outputs from the network
  let actions = brain.predict(inputs);

  let max = Math.max(...actions);

  if (max === actions[0] && actions[0] > 0.6) return 'BUY';
  if (max === actions[1] && actions[1] > 0.6) return 'SELL';
  if (useExitStrategy && max === actions[2] && actions[2] > 0.6) return 'CLOSE';
}
