import { BotConfig } from '../init';
import { AbstractStrategy, StrategyHyperParameters } from '../init';
import { BasicBackTestBot } from './bot';

var startTime = performance.now();

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
        .then(() => {
          let parametersString =
            '[ ' +
            Object.entries(parameters)
              .map(
                ([parameterName, config]) => `${parameterName}: ${config.value}`
              )
              .join(', ') +
            ' ]';
          console.log(parametersString + ' done!');
          resolve([bot.strategyReport, parameters]);
        })
        .catch(reject);
    });
  }

  // ========================================================================================== //

  let parameterNames = Object.keys(StrategyHyperParameters).map((name) => name);
  let parameterValues = Object.values(StrategyHyperParameters).map(
    ({ optimization }) => {
      if (optimization && optimization.length > 1) {
        // A range between two value
        if (
          typeof optimization[0] === 'number' &&
          optimization.length === 2 &&
          optimization[0] < optimization[1]
        ) {
          let values = [];
          let [min, max] = optimization;
          for (let i = min; i <= max; i++) {
            values.push(i);
          }
          return values;
        }
        // Specified number or string values
        else {
          return optimization;
        }
      } else {
        return [];
      }
    }
  );

  // ========================================================================================== //

  let allHyperParameters: HyperParameters[] = []; // Combination of all hyper parameters
  let indexToOptimize: number[] = [];

  // Find the parameters index to optimize
  for (let i = 0; i < parameterValues.length; i++) {
    if (parameterValues[i].length > 0) indexToOptimize.push(i);
  }

  let parameterCombinations = (i: number, parameters: HyperParameters) => {
    let currentIndexToOptimize = indexToOptimize[i];

    if (i >= indexToOptimize.length) {
      allHyperParameters.push({ ...parameters });
      return;
    }

    for (let n = 0; n < parameterValues[currentIndexToOptimize].length; n++) {
      parameters[parameterNames[currentIndexToOptimize]] = {
        value: parameterValues[currentIndexToOptimize][n],
      };
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
      console.log(
        '\n================== Optimized Parameters Found =================='
      );
      console.log(bestResultParameters);
      console.log(
        '\n================== Report With the Optimized Parameters =================='
      );
      console.log(bestResultStrategyReport);

      var endTime = performance.now();
      console.log(
        `Call to doSomething took ${endTime - startTime} milliseconds`
      );
    });
}
