import fs from 'fs';
import path from 'path';

/**
 * Generate the strategy report with an html file
 * @param strategyName
 * @param strategyReport
 * @param labels
 * @param lineData
 */
export default function (
  strategyName: string,
  strategyReport: StrategyReport,
  labels: string[],
  lineData: number[]
) {
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
            margin-bottom: 30px;
          }
          .block {
            display: inline-block;
            margin: 50px;
            padding: 25px;
          }
          table {
          }
          td {
            text-align: left;
            padding-left: 30px;
          }
          #chart {
            padding: auto;
            margin: auto;
            width: 1200px;
          }
        </style>
      </head>
      <body>
        <h1>Strategy Report</h1>
        <div class="block">
          <table>
            <tr>
              <td><b>Test period:</b></td>
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
              <td><b>Max drawdown:</b></td>
              <td>${strategyReport.maxDrawdown}%</td>
            </tr>
          </table>
        </div>
        <div class="block">
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
        <canvas id="chart"></canvas>
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
                tension: 0.01,
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
  let file = path.join(directory, `${strategyName}_strategy-report.html`);

  if (!fs.existsSync(directory)) fs.mkdirSync(directory);
  if (fs.existsSync(file)) fs.unlinkSync(file);

  fs.writeFileSync(file, html, 'utf-8');
}
