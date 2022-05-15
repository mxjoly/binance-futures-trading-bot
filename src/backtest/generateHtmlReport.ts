import dayjs from 'dayjs';
import fs from 'fs';
import path from 'path';
import open from 'open';
import { decimalFloor } from '../utils/math';

/**
 * Generate the strategy report with an html file
 * @param strategyName
 * @param strategyHyperParameters
 * @param strategyReport
 * @param labels
 * @param lineData
 */
export default function (
  strategyName: string,
  strategyHyperParameters: HyperParameters,
  strategyReport: StrategyReport,
  tradesHistoric: TradesHistoric,
  labels: string[],
  lineData: number[]
) {
  let parametersHtml = `${Object.entries(strategyHyperParameters)
    .map(
      ([name, config]) =>
        `<tr><th><b>${name}</b></th><th>${config.value}</th></tr>`
    )
    .join('')}`;

  let tradeNo = 0;
  let historicHtml = tradesHistoric
    .reverse()
    .map((row) => {
      return (
        (row.action === 'CLOSE' ? '<tr class="colored">' : '<tr>') +
        `<th><b>${
          row.action === 'OPEN' ? strategyReport.totalTrades - tradeNo++ : ''
        }</b></th>` +
        `<th>${dayjs(row.date).format('YYYY-MM-DD HH:mm:ss')}</th>` +
        `<th>${row.symbol}</th>` +
        `<th>${row.side.toLowerCase()}</th>` +
        `<th>${row.type.toLowerCase()}</th>` +
        `<th>${row.action.toLowerCase()}</th>` +
        `<th>${decimalFloor(row.size, 3)}</th>` +
        `<th>${row.price}</th>` +
        `<th>${row.pnl ? decimalFloor(row.pnl, 2) : ' '}</th>` +
        `<th>${decimalFloor(row.balance, 2)}</th>` +
        '</tr>'
      );
    })
    .join('');

  let html = `
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
        <title>Strategy Report</title>
        <style type="text/css">
          html,
          body {
            height: 100%;
            font-family: 'Avenir';
          }
          body {
            margin: 0;
            text-align: center;
          }
          h1 {
            margin-top: 10px;
          }
          h2 {
            margin-top: 20px;
            margin-bottom: 20px;
          }
          h3 {
            color: #666;
            font-style: italic;
          }
          #parameters {
            margin: 30px auto;
          }
          #parameters th {
            padding: 0px 10px;
            min-width: 100px;
          }
          .report {
            display: flex;
            flex-direction: row;
            justify-content: center;
            align-items: center;
            border: solid 1px black;
            width: max-content;
            margin: 50px auto;
          }
          .report-frame {
            display: block;
            margin: 10px;
            padding: 15px;
            max-width: 600px;
          }
          #chart {
            padding: auto;
            margin: auto;
            width: 1200px;
          }
          #historic {
            text-align: left;
            width: auto;
            margin: auto;
            border-collapse: collapse;
          }
          #historic th {
            padding: 10px;
            min-width: 65px;
            border: solid 1px #BBB;
          }
          #historic .colored {
            background: #EEE;
          }
          #historic tbody th {
            font-weight: 200;
          }
        </style>
      </head>
      <body>
        <h1>Strategy Report</h1>
        <h3>${strategyName}</h3>

        <h2>Parameters</h2>
        <table id="parameters">
          ${parametersHtml}
        </table>

        <h2>Resume</h2>
        <div class="report">
          <div class="report-frame">
            <table>
              <tr>
                <td><b>Period:</b></td>
                <td>${strategyReport.testPeriod}</td>
              </tr>
              <tr>
                <td><b>Total bars:</b></td>
                <td>${strategyReport.totalBars}</td>
              </tr>
              <tr>
                <td><b>Initial capital:</b></td>
                <td>${strategyReport.initialCapital}</td>
              </tr>
              <tr>
                <td><b>Final capital:</b></td>
                <td>${strategyReport.finalCapital}</td>
              </tr>
              <tr>
                <td><b>Total net profit:</b></td>
                <td>${strategyReport.totalNetProfit}</td>
              </tr>
              <tr>
                <td><b>Total profit:</b></td>
                <td>${strategyReport.totalProfit}</td>
              </tr>
              <tr>
                <td><b>Total loss:</b></td>
                <td>${strategyReport.totalLoss}</td>
              </tr>
              <tr>
                <td><b>Total fees:</b></td>
                <td>${strategyReport.totalFees}</td>
              </tr>
              <tr>
                <td><b>Profit factor:</b></td>
                <td>${strategyReport.profitFactor}</td>
              </tr>
              <tr>
                <td><b>Max absolute drawdown:</b></td>
                <td>${strategyReport.maxAbsoluteDrawdown}%</td>
              </tr>
              <tr>
                <td><b>Max relative drawdown:</b></td>
                <td>${strategyReport.maxRelativeDrawdown}%</td>
              </tr>
            </table>
          </div>
          <div class="report-frame">
            <table>
              <tr>
                <td><b>Total trades:</b></td>
                <td>${strategyReport.totalTrades}</td>
              </tr>
              <tr>
                <td><b>Total win rate:</b></td>
                <td>${strategyReport.totalWinRate}%</td>
              </tr>
              <tr>
                <td><b>Long trades won:</b></td>
                <td>${strategyReport.longWinRate}% (${
    strategyReport.longWinningTrade
  }/${strategyReport.totalLongTrades})</td>
              </tr>
              <tr>
                <td><b>Short trades won:</b></td>
                <td>${strategyReport.shortWinRate}% (${
    strategyReport.shortWinningTrade
  }/${strategyReport.totalShortTrades})</td>
              </tr>
              <tr>
                <td><b>Max profit:</b></td>
                <td>${strategyReport.maxProfit}</td>
              </tr>
              <tr>
                <td><b>Max loss:</b></td>
                <td>${strategyReport.maxLoss}</td>
              </tr>
              <tr>
                <td><b>Max consecutive profit:</b></td>
                <td>${strategyReport.maxConsecutiveProfit}</td>
              </tr>
              <tr>
                <td><b>Max consecutive loss:</b></td>
                <td>${strategyReport.maxConsecutiveLoss}</td>
              </tr>
              <tr>
                <td><b>Max consecutive wins (count):</b></td>
                <td>${strategyReport.maxConsecutiveWinsCount}</td>
              </tr>
              <tr>
                <td><b>Max consecutive losses (count):</b></td>
                <td>${strategyReport.maxConsecutiveLossesCount}</td>
              </tr>
            </table>
          </div>
        </div>

        <canvas id="chart"></canvas>

        <h2>Trades Historic</h2>
        <table id="historic">
          <thead>
            <tr>
              <th>#</th>
              <th>Date</th>
              <th>Symbol</th>
              <th>Side</th>
              <th>Type</th>
              <th>Action</th>
              <th>Size</th>
              <th>Price</th>
              <th>Pnl</th>
              <th>Balance</th>
            </tr>
          </thead>
          <tbody>
            ${historicHtml}
          </tbody>
        </table>

        <script>
          var ctx = document.getElementById('chart').getContext('2d');
          const data = {
            labels: [${labels.map((label) => `"${label}"`).join(',')}],
            datasets: [
              {
                label: 'Balance',
                data: [${lineData.map((data) => `"${data}"`).join(',')}],
                fill: false,
                borderColor: '#007FFF',
                tension: 0.1,
              }
            ],
          };

          var config = {
            type: 'line',
            data: data,
            options: {
              pointRadius: 0,
              plugins: {
                title: {
                  display: true,
                  text: 'Evolution of the wallet balance',
                  font: {
                    size: 32
                  }
                }
              }
            }
          };

          chart = new Chart(ctx, config);
        </script>
      </body>
    </html>
  `;

  const directory = path.join(process.cwd(), 'reports');
  const filename = `${strategyName
    .replace(' ', '')
    .toLowerCase()}-report-${Date.now()}.html`;
  let file = path.join(directory, filename);

  if (!fs.existsSync(directory)) fs.mkdirSync(directory);
  if (fs.existsSync(file)) fs.unlinkSync(file);

  fs.writeFileSync(file, html, 'utf-8');
  open(file);
}
