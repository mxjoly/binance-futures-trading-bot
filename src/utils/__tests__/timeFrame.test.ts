import { CandleChartInterval } from 'binance-api-node';
import dayjs from 'dayjs';
import {
  compareTimeFrame,
  dateMatchTimeFrame,
  durationBetweenDates,
  timeFrameToMinutes,
} from '../timeFrame';

describe('Time Frame', () => {
  it('compareTimeFrame', () => {
    expect(
      compareTimeFrame(
        CandleChartInterval.FIFTEEN_MINUTES,
        CandleChartInterval.FIFTEEN_MINUTES
      )
    ).toBe(0);
    expect(
      compareTimeFrame(
        CandleChartInterval.FIFTEEN_MINUTES,
        CandleChartInterval.ONE_HOUR
      )
    ).toBe(-1);
    expect(
      compareTimeFrame(
        CandleChartInterval.ONE_HOUR,
        CandleChartInterval.FIFTEEN_MINUTES
      )
    ).toBe(1);
  });

  it('dateMatchTimeFrame', () => {
    let date1 = dayjs('2022-03-01 12:00:00', 'YYYY-MM-DD HH:mm:ss').toDate();
    let date2 = dayjs('2022-03-01 12:01:00', 'YYYY-MM-DD HH:mm:ss').toDate();

    // Date 1
    expect(dateMatchTimeFrame(date1, CandleChartInterval.ONE_MINUTE)).toBe(
      true
    );
    expect(dateMatchTimeFrame(date1, CandleChartInterval.FIVE_MINUTES)).toBe(
      true
    );
    expect(dateMatchTimeFrame(date1, CandleChartInterval.FIFTEEN_MINUTES)).toBe(
      true
    );
    expect(dateMatchTimeFrame(date1, CandleChartInterval.FIFTEEN_MINUTES)).toBe(
      true
    );
    expect(dateMatchTimeFrame(date1, CandleChartInterval.THIRTY_MINUTES)).toBe(
      true
    );
    expect(dateMatchTimeFrame(date1, CandleChartInterval.ONE_HOUR)).toBe(true);
    expect(dateMatchTimeFrame(date1, CandleChartInterval.TWO_HOURS)).toBe(true);
    expect(dateMatchTimeFrame(date1, CandleChartInterval.FOUR_HOURS)).toBe(
      true
    );
    expect(dateMatchTimeFrame(date1, CandleChartInterval.SIX_HOURS)).toBe(true);
    expect(dateMatchTimeFrame(date1, CandleChartInterval.TWELVE_HOURS)).toBe(
      true
    );
    expect(dateMatchTimeFrame(date1, CandleChartInterval.ONE_DAY)).toBe(false);
    expect(dateMatchTimeFrame(date1, CandleChartInterval.ONE_WEEK)).toBe(false);

    // Date 2
    expect(dateMatchTimeFrame(date2, CandleChartInterval.ONE_MINUTE)).toBe(
      true
    );
    expect(dateMatchTimeFrame(date2, CandleChartInterval.FIVE_MINUTES)).toBe(
      false
    );
    expect(dateMatchTimeFrame(date2, CandleChartInterval.FIFTEEN_MINUTES)).toBe(
      false
    );
    expect(dateMatchTimeFrame(date2, CandleChartInterval.FIFTEEN_MINUTES)).toBe(
      false
    );
    expect(dateMatchTimeFrame(date2, CandleChartInterval.THIRTY_MINUTES)).toBe(
      false
    );
    expect(dateMatchTimeFrame(date2, CandleChartInterval.ONE_HOUR)).toBe(false);
    expect(dateMatchTimeFrame(date2, CandleChartInterval.TWO_HOURS)).toBe(
      false
    );
    expect(dateMatchTimeFrame(date2, CandleChartInterval.FOUR_HOURS)).toBe(
      false
    );
    expect(dateMatchTimeFrame(date2, CandleChartInterval.SIX_HOURS)).toBe(
      false
    );
    expect(dateMatchTimeFrame(date2, CandleChartInterval.TWELVE_HOURS)).toBe(
      false
    );
    expect(dateMatchTimeFrame(date2, CandleChartInterval.ONE_DAY)).toBe(false);
    expect(dateMatchTimeFrame(date1, CandleChartInterval.ONE_WEEK)).toBe(false);
  });

  it('timeFrameToMinutes', () => {
    expect(timeFrameToMinutes(CandleChartInterval.ONE_MINUTE)).toBe(1);
    expect(timeFrameToMinutes(CandleChartInterval.FIVE_MINUTES)).toBe(5);
    expect(timeFrameToMinutes(CandleChartInterval.FIFTEEN_MINUTES)).toBe(15);
    expect(timeFrameToMinutes(CandleChartInterval.THIRTY_MINUTES)).toBe(30);
    expect(timeFrameToMinutes(CandleChartInterval.ONE_HOUR)).toBe(60);
    expect(timeFrameToMinutes(CandleChartInterval.TWO_HOURS)).toBe(120);
    expect(timeFrameToMinutes(CandleChartInterval.FOUR_HOURS)).toBe(240);
    expect(timeFrameToMinutes(CandleChartInterval.SIX_HOURS)).toBe(360);
    expect(timeFrameToMinutes(CandleChartInterval.TWELVE_HOURS)).toBe(720);
    expect(timeFrameToMinutes(CandleChartInterval.ONE_DAY)).toBe(1440);
    expect(timeFrameToMinutes(CandleChartInterval.ONE_WEEK)).toBe(null);
  });

  it('durationBetweenDates', () => {
    let date1 = dayjs('2022-03-01 06:00:00', 'YYYY-MM-DD HH:mm:ss').toDate();
    let date2 = dayjs('2022-03-01 18:00:00', 'YYYY-MM-DD HH:mm:ss').toDate();
    expect(
      durationBetweenDates(date1, date2, CandleChartInterval.ONE_MINUTE)
    ).toBe(12 * 60);
    expect(
      durationBetweenDates(date1, date2, CandleChartInterval.FIVE_MINUTES)
    ).toBe(12 * 12);
    expect(
      durationBetweenDates(date1, date2, CandleChartInterval.FIFTEEN_MINUTES)
    ).toBe(4 * 12);
    expect(
      durationBetweenDates(date1, date2, CandleChartInterval.THIRTY_MINUTES)
    ).toBe(2 * 12);
    expect(
      durationBetweenDates(date1, date2, CandleChartInterval.ONE_HOUR)
    ).toBe(12);
    expect(
      durationBetweenDates(date1, date2, CandleChartInterval.TWO_HOURS)
    ).toBe(6);
    expect(
      durationBetweenDates(date1, date2, CandleChartInterval.FOUR_HOURS)
    ).toBe(3);
    expect(
      durationBetweenDates(date1, date2, CandleChartInterval.SIX_HOURS)
    ).toBe(2);
    expect(
      durationBetweenDates(date1, date2, CandleChartInterval.TWELVE_HOURS)
    ).toBe(1);
    expect(
      durationBetweenDates(date1, date2, CandleChartInterval.ONE_DAY)
    ).toBe(0);
  });
});
