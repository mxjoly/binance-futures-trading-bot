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

    const formatNumber = (n: number) => {
      return String(n).padStart(2, '0');
    };

    const year = currentTime.year();
    const month = formatNumber(currentTime.month() + 1);
    const date = formatNumber(currentTime.date());
    const day = `${year}-${month}-${date}`;

    for (let i = 0; i < tradingSessions.length; i++) {
      let { end, start } = tradingSessions[i];

      if (tradingSessions[i].day === currentTime.day()) {
        let startHour = formatNumber(start.hour);
        let startMin = formatNumber(start.minute);
        let endHour = formatNumber(end.hour);
        let endMin = formatNumber(end.minute);
        let currentHour = formatNumber(currentTime.hour());
        let currentMin = formatNumber(currentTime.minute());

        let startSessionTime = `${day} ${startHour}:${startMin}:00`;
        let endSessionTime = `${day} ${endHour}:${endMin}:00`;
        let current = `${day} ${currentHour}:${currentMin}:00`;

        if (dayjs(current).isBetween(startSessionTime, endSessionTime)) {
          return true;
        }
      }
    }

    return false;
  } else {
    return true;
  }
}
