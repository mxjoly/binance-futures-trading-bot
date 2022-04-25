import dayjs from 'dayjs';

/**
 * Check if we are in one of the trading sessions authorized for trading. If not, the robot waits, and does nothing
 * @param currentDate
 * @param tradingSessions
 */
export function isOnTradingSession(
  currentDate: Date,
  tradingSessions?: TradingSession[]
) {
  if (tradingSessions && tradingSessions.length > 0) {
    const currentTime = dayjs(currentDate);
    const currentDay = currentTime.format('YYYY-MM-DD');

    tradingSessions
      .filter((session) => session.day === dayjs(currentDay).day())
      .forEach(({ start, end }) => {
        const startSessionTime = `${currentDay} ${start.hour}:${start.minute}`;
        const endSessionTime = `${currentDay} ${end.hour}:${end.minutes}`;
        if (
          dayjs(currentTime.format('YYYY-MM-DD HH:mm:ss')).isBetween(
            startSessionTime,
            endSessionTime
          )
        ) {
          return true;
        }
      });

    return false;
  } else {
    return true;
  }
}
