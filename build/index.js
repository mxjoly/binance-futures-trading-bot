"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (_) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
var winston_1 = __importDefault(require("winston"));
var binance_api_node_1 = __importStar(require("binance-api-node"));
require('dotenv').config();
// Technical indicators
var indicators = require('technicalindicators');
var RSI = indicators.RSI;
var trades = [
    {
        mode: 'futures',
        asset: 'BTC',
        base: 'USDT',
        allocation: 0.05,
        lossTolerance: 0.1,
        profitTarget: 0.3,
        period: 33,
        interval: binance_api_node_1.CandleChartInterval.ONE_MINUTE,
    },
];
var logger = winston_1.default.createLogger({
    level: 'info',
    format: winston_1.default.format.simple(),
    defaultMeta: { date: new Date(Date.now()) },
    transports: [new winston_1.default.transports.File({ filename: 'bot.log' })],
});
var binanceClient = binance_api_node_1.default({
    apiKey: process.env.BINANCE_PUBLIC_KEY,
    apiSecret: process.env.BINANCE_PRIVATE_KEY,
});
// RSI
var RSI_PERIOD = 14;
var RSI_OVERBOUGHT = 70;
var RSI_OVERSOLD = 30;
var closeCandles = {};
function prepare() {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            trades
                .map(function (trade) { return trade.asset + trade.base; })
                .forEach(function (pair) {
                closeCandles[pair] = [];
            });
            return [2 /*return*/];
        });
    });
}
function run() {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            binanceClient.accountInfo().then(function (_a) {
                var balances = _a.balances;
                console.log(balances);
            });
            trades.forEach(function (trade) {
                var pair = trade.asset + trade.base;
                binanceClient.ws.candles(pair, trade.interval, function (candle) {
                    var candles = closeCandles[pair];
                    // Get only the candles for the trade period
                    if (candles.length > trade.period)
                        candles.splice(1);
                    // Add the new candle
                    if (candle.isFinal) {
                        candles.push(candle);
                    }
                    // Wait until the trade period
                    if (candles.length < trade.period)
                        return;
                    // if (trade.mode === 'spot') {
                    //   tradeWithSpot(trade, candles);
                    // } else if (trade.mode === 'futures') {
                    //   tradeWithFutures(trade, candles);
                    // }
                    // console.log(
                    //   getLocaleDate(candle.closeTime, new Date().getTimezoneOffset())
                    // );
                });
                // .miniTicker('HSRETH', ticker => {
                //   console.log(ticker)
                // })
                // binanceClient
                //   .candles({ symbol: trade.symbol, interval: trade.interval })
                //   .then((candles) => {
                //     const periodCandles = candles.slice(candles.length - trade.period);
                //     if (trade.mode === 'spot') {
                //       tradeWithSpot(trade, periodCandles);
                //     } else if (trade.mode === 'futures') {
                //       tradeWithFutures(trade, periodCandles);
                //     }
                //     // console.log(
                //     //   getLocaleDate(candle.closeTime, new Date().getTimezoneOffset())
                //     // );
                //   });
            });
            return [2 /*return*/];
        });
    });
}
function tradeWithSpot(tradeConfig, candles, realtimePrice) {
    return __awaiter(this, void 0, void 0, function () {
        return __generator(this, function (_a) {
            binanceClient.accountInfo().then(function (_a) {
                var balances = _a.balances;
                binanceClient
                    .myTrades({
                    symbol: tradeConfig.asset + tradeConfig.base,
                })
                    .then(function (trades) {
                    if (trades.length > 0) {
                        var trade = trades[0];
                    }
                    else if (isBuySignal(tradeConfig, candles)) {
                        // Buy order
                        binanceClient.order({
                            side: 'BUY',
                            symbol: tradeConfig.asset + tradeConfig.base,
                            type: 'MARKET',
                            quantity: String((balances[tradeConfig.base] * tradeConfig.allocation) /
                                realtimePrice),
                        });
                        if (tradeConfig.profitTarget) {
                            // TP/SL
                            // binanceClient.orderOco({
                            //   side: 'SELL',
                            //   symbol: tradeConfig.asset + tradeConfig.base,
                            //   price: String(realtimePrice * tradeConfig.profitTarget),
                            //   quantity: balances[tradeConfig.asset],
                            // });
                        }
                    }
                })
                    .catch(logger.warning);
            });
            return [2 /*return*/];
        });
    });
}
function tradeWithFutures(trade, candles, realtimePrice) {
    return __awaiter(this, void 0, void 0, function () { return __generator(this, function (_a) {
        return [2 /*return*/];
    }); });
}
function isBuySignal(tradeConfig, candles) {
    var isBuySignalRSI = function () {
        var rsiValues = RSI.calculate({
            values: candles.map(function (candle) { return candle.close; }),
            period: tradeConfig.period,
        });
        var last = rsiValues[rsiValues.length - 2];
        var current = rsiValues[rsiValues.length - 1];
        // The rsi crossed the oversold line
        return last < RSI_OVERSOLD && current > RSI_OVERSOLD;
    };
    return isBuySignalRSI();
}
function isSellSignal(trade, candles) {
    var isSellSignalRSI = function () {
        var rsiValues = RSI.calculate({
            values: candles.map(function (candle) { return candle.close; }),
            period: trade.period,
        });
        var last = rsiValues[rsiValues.length - 2];
        var current = rsiValues[rsiValues.length - 1];
        // The rsi crossed the overbought line
        return last > RSI_OVERBOUGHT && current < RSI_OVERBOUGHT;
    };
    return isSellSignalRSI();
}
function getLocaleDate(time, offset) {
    return new Date(time - offset * 60 * 1000);
}
prepare();
run();
