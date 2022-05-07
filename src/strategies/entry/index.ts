import * as RSI from './basics/rsi';
import * as MA from './basics/ma';
import * as MACD from './basics/macd';
import * as MA_CROSS from './basics/maCross';
import * as RELOAD_ZONE from './basics/reloadZone';
import * as STOCHASTIC_RSI from './basics/stochasticRsi';

export const Basics = {
  RSI,
  MA,
  MACD,
  MA_CROSS,
  RELOAD_ZONE,
  STOCHASTIC_RSI,
};

import * as BITCOIN_SNIPER_V1 from './complex/bitcoinSniperV1';
import * as BITCOIN_V1 from './complex/bitcoinV1';

export const Complex = {
  BITCOIN_V1,
  BITCOIN_SNIPER_V1,
};
