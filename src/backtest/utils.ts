import { CandleChartInterval } from 'binance-api-node';
import dayjs from 'dayjs';

/**
 * Test if a date string match a time frame
 * @param {string} date
 * @param {string} timeFrame
 */
export function dateMatchTimeFrame(date: Date, timeFrame: CandleChartInterval) {
  let dateFormat = dayjs(new Date(date)).format('HH:mm');
  switch (timeFrame) {
    case CandleChartInterval.ONE_MINUTE:
      return /^(0[0-9]|1[0-9]|2[0-3]):[0-5][0-9]$/.test(dateFormat);
    case CandleChartInterval.FIVE_MINUTES:
      return /^(0[0-9]|1[0-9]|2[0-3]):[0-5][05]$/.test(dateFormat);
    case CandleChartInterval.FIFTEEN_MINUTES:
      return /^(0[0-9]|1[0-9]|2[0-3]):(00|15|30|45)$/.test(dateFormat);
    case CandleChartInterval.THIRTY_MINUTES:
      return /^(0[0-9]|1[0-9]|2[0-3]):(00|30)$/.test(dateFormat);
    case CandleChartInterval.ONE_HOUR:
      return /^(0[0-9]|1[0-9]|2[0-3]):(00)$/.test(dateFormat);
    case CandleChartInterval.TWO_HOURS:
      return /^(0[02468]|1[02468]|2[02]):(00)$/.test(dateFormat);
    case CandleChartInterval.FOUR_HOURS:
      return /^(0[048]|1[26]|2[0]):(00)$/.test(dateFormat);
    case CandleChartInterval.SIX_HOURS:
      return /^(0[06]|1[28]):(00)$/.test(dateFormat);
    case CandleChartInterval.TWELVE_HOURS:
      return /^(00|12):(00)$/.test(dateFormat);
    case CandleChartInterval.ONE_DAY:
      return /^(00):(00)$/.test(dateFormat);
    default:
      return false;
  }
}

/**
 * Get the minutes in a time frame
 * @param timeFrame
 */
export function timeFrameToMinutes(timeFrame: CandleChartInterval) {
  switch (timeFrame) {
    case CandleChartInterval.ONE_MINUTE:
      return 1;
    case CandleChartInterval.FIVE_MINUTES:
      return 5;
    case CandleChartInterval.FIFTEEN_MINUTES:
      return 15;
    case CandleChartInterval.THIRTY_MINUTES:
      return 30;
    case CandleChartInterval.ONE_HOUR:
      return 60;
    case CandleChartInterval.TWO_HOURS:
      return 2 * 60;
    case CandleChartInterval.FOUR_HOURS:
      return 4 * 60;
    case CandleChartInterval.SIX_HOURS:
      return 6 * 60;
    case CandleChartInterval.TWELVE_HOURS:
      return 12 * 60;
    case CandleChartInterval.ONE_DAY:
      return 24 * 60;
    default:
      return null;
  }
}

/**
 * Compare two time frame
 * @param timeFrame1
 * @param timeFrame2
 * @returns 1, -1, or 0
 */
export function compareTimeFrame(
  timeFrame1: CandleChartInterval,
  timeFrame2: CandleChartInterval
) {
  return timeFrameToMinutes(timeFrame1) > timeFrameToMinutes(timeFrame2)
    ? 1
    : timeFrameToMinutes(timeFrame1) < timeFrameToMinutes(timeFrame2)
    ? -1
    : 0;
}
