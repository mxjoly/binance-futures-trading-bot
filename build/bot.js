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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
var winston_1 = __importDefault(require("winston"));
var binance_api_node_1 = __importStar(require("binance-api-node"));
var rsi_1 = require("./rsi");
require('dotenv').config();
var tradeConfigs = [
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
var closeCandles = {};
function prepare() {
    tradeConfigs
        .map(function (tradeConfig) { return tradeConfig.asset + tradeConfig.base; })
        .forEach(function (pair) {
        closeCandles[pair] = [];
    });
}
function run() {
    // SPOT
    tradeConfigs
        .filter(function (tradeConfig) { return tradeConfig.mode === 'spot'; })
        .forEach(function (tradeConfig) {
        var pair = tradeConfig.asset + tradeConfig.base;
        binanceClient.ws.candles(pair, tradeConfig.interval, function (candle) {
            var candles = closeCandles[pair];
            // Get only the candles for the trade period
            if (candles.length > tradeConfig.period)
                candles.splice(1);
            // Add the new candle
            if (candle.isFinal) {
                candles.push(candle);
            }
            tradeWithSpot(tradeConfig, candles, Number(candle.close));
        });
    });
    // FUTURES
    tradeConfigs
        .filter(function (tradeConfig) { return tradeConfig.mode === 'futures'; })
        .forEach(function (tradeConfig) {
        var pair = tradeConfig.asset + tradeConfig.base;
        // @ts-ignore
        binanceClient.ws.futuresCandles(pair, tradeConfig.interval, function (candle) {
            var candles = closeCandles[pair];
            // Get only the candles for the trade period
            if (candles.length > tradeConfig.period)
                candles.splice(1);
            // Add the new candle
            if (candle.isFinal) {
                candles.push(candle);
            }
            tradeWithFutures(tradeConfig, candles, Number(candle.close));
        });
    });
}
function tradeWithSpot(tradeConfig, candles, realtimePrice) {
    binanceClient.accountInfo().then(function (_a) {
        var balances = _a.balances;
        // Balance free crypto
        var asset = Number(balances.find(function (balance) { return balance.asset === tradeConfig.asset; }).free);
        var base = Number(balances.find(function (balance) { return balance.asset === tradeConfig.base; }).free);
        binanceClient
            .myTrades({
            symbol: tradeConfig.asset + tradeConfig.base,
        })
            .then(function (trades) {
            if (trades.length === 0 && isBuySignal(tradeConfig, candles)) {
                // Buy market order
                binanceClient.order({
                    side: 'BUY',
                    type: 'MARKET',
                    symbol: tradeConfig.asset + tradeConfig.base,
                    quantity: String((base * tradeConfig.allocation) / realtimePrice),
                });
                if (tradeConfig.profitTarget) {
                    // Sell oco order
                    binanceClient.orderOco({
                        side: 'SELL',
                        symbol: tradeConfig.asset + tradeConfig.base,
                        price: String(realtimePrice * tradeConfig.profitTarget),
                        stopPrice: String(realtimePrice * tradeConfig.lossTolerance),
                        stopLimitPrice: String(realtimePrice * tradeConfig.lossTolerance),
                        quantity: String(asset),
                    });
                }
                else {
                    // Sell limit order
                    binanceClient.order({
                        side: 'SELL',
                        type: 'LIMIT',
                        symbol: tradeConfig.asset + tradeConfig.base,
                        price: String(realtimePrice * tradeConfig.lossTolerance),
                        quantity: String(asset),
                    });
                }
            }
        })
            .catch(logger.warning);
    });
}
function tradeWithFutures(tradeConfig, candles, realtimePrice) {
    binanceClient.futuresAccountBalance().then(function (balances) {
        // Balance free crypto
        var base = Number(balances.find(function (balance) { return balance.asset === tradeConfig.base; })
            .availableBalance);
    });
}
function isBuySignal(tradeConfig, candles) {
    return rsi_1.isBuySignalRSI(tradeConfig, candles);
}
function isSellSignal(tradeConfig, candles) {
    return rsi_1.isSellSignalRSI(tradeConfig, candles);
}
prepare();
run();
