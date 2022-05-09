import dayjs from 'dayjs';
import { isOnTradingSession } from '../tradingSession';

describe('Trading Session', () => {
  it('isOnTradingSession', () => {
    let tradingSessions: TradingSession[] = [
      {
        day: 1, // monday
        start: { hour: 9, minute: 0 },
        end: { hour: 18, minute: 0 },
      },
      {
        day: 2, // tuesday
        start: { hour: 9, minute: 0 },
        end: { hour: 18, minute: 0 },
      },
    ];

    let testDate1 = dayjs(
      '2022-04-04 15:00:00',
      'YYYY-MM-DD HH:mm:ss'
    ).toDate();
    let testDate2 = dayjs(
      '2022-04-05 10:00:00',
      'YYYY-MM-DD HH:mm:ss'
    ).toDate();
    let testDate3 = dayjs(
      '2022-04-05 08:00:00',
      'YYYY-MM-DD HH:mm:ss'
    ).toDate();

    expect(isOnTradingSession(testDate1, tradingSessions)).toBe(true);
    expect(isOnTradingSession(testDate2, tradingSessions)).toBe(true);
    expect(isOnTradingSession(testDate3, tradingSessions)).toBe(false);
  });

  it('isOnTradingSession with the array of sessions empty', () => {
    let testDate1 = dayjs(
      '2022-04-04 15:00:00',
      'YYYY-MM-DD HH:mm:ss'
    ).toDate();
    expect(isOnTradingSession(testDate1, [])).toBe(true);
  });
});
