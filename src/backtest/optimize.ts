import { BotConfig } from '../init';
import { AbstractStrategy, StrategyHyperParameters } from '../init';
import { BasicBackTestBot } from './bot';

if (process.env.NODE_ENV === 'test') {
  const BacktestConfig = BotConfig['backtest'];
  const startDate = new Date(BacktestConfig['start_date']);
  const endDate = new Date(BacktestConfig['end_date']);
  const initialCapital = BacktestConfig['initial_capital'];
  const strategyName = BotConfig['strategy_name'];

  function run(parameters: HyperParameters) {
    const bot = new BasicBackTestBot(
      AbstractStrategy(parameters),
      parameters,
      strategyName,
      startDate,
      endDate,
      initialCapital,
      false
    );
    bot.prepare();
    return new Promise<[StrategyReport, HyperParameters]>((resolve, reject) => {
      bot
        .run()
        .then(() => resolve([bot.strategyReport, parameters]))
        .catch(reject);
    });
  }

  // ========================================================================================== //

  let parameterNames = Object.keys(StrategyHyperParameters).map((name) => name);
  let parameterValues = Object.values(StrategyHyperParameters).map(
    ({ optimization }) => {
      if (optimization) {
        let values = [];
        let [min, max] = optimization;
        for (let i = min; i <= max; i++) {
          values.push(i);
        }
        return values;
      } else {
        return [];
      }
    }
  );

  // ========================================================================================== //

  let allHyperParameters: HyperParameters[] = []; // Combination of all hyper parameters

  let parameterCombinations = (i: number, parameters: HyperParameters) => {
    if (i >= parameterNames.length || parameterValues[i].length === 0) {
      allHyperParameters.push({ ...parameters });
      return;
    }

    for (let n = 0; n < parameterValues[i].length; n++) {
      parameters[parameterNames[i]] = { value: parameterValues[i][n] };
      parameterCombinations(i + 1, parameters);
    }
  };

  parameterCombinations(0, { ...StrategyHyperParameters });

  // ========================================================================================== //

  /**
   * Return true if a is better than b, else false
   */
  function compareStrategyReport(a: StrategyReport, b: StrategyReport) {
    const roi = (r: StrategyReport) =>
      (r.finalCapital - r.initialCapital) / r.initialCapital;

    let evalA = roi(a) / Math.abs(a.maxRelativeDrawdown);
    let evalB = roi(b) / Math.abs(b.maxRelativeDrawdown);
    // let evalA = a.finalCapital;
    // let evalB = b.finalCapital;

    return evalA > evalB ? true : false;
  }

  let bestResultParameters: HyperParameters = {};
  let bestResultStrategyReport: StrategyReport = null;
  let promises: Promise<[StrategyReport, HyperParameters]>[] = [];

  allHyperParameters.forEach((parameters) => {
    promises.push(run(parameters));
  });

  Promise.all(promises)
    .then((results) => {
      results.forEach(([strategyReport, hyperParameters]) => {
        if (
          (Object.keys(bestResultParameters).length === 0 &&
            bestResultStrategyReport === null) ||
          compareStrategyReport(strategyReport, bestResultStrategyReport)
        ) {
          bestResultParameters = hyperParameters;
          bestResultStrategyReport = strategyReport;
        }
      });
    })
    .then(() => {
      console.log('\n================== Strategy Report ==================');
      console.log(bestResultStrategyReport);
      console.log(
        '\n================== Optimized Parameters Found =================='
      );
      console.log(bestResultParameters);
    });
}
