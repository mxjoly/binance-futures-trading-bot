const technicalIndicators = require('technicalindicators');
technicalIndicators.setConfig('precision', 10);

export default technicalIndicators;

export * as RSI from './rsi';
export * as SMA from './sma';
export * as CROSS_SMA from './cross_sma';
export * as RSI_SMA from './rsi_sma';
