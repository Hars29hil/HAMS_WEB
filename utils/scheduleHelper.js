const { getCurrentIST } = require('./time');

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function normalizeHHMM(timeStr) {
  if (!timeStr) return '00:00';
  const parts = String(timeStr).trim().split(':');
  const h = parseInt(parts[0] || '0', 10);
  const m = parseInt(parts[1] || '0', 10);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function isTimeInWindow(now, startTimeStr, endTimeStr) {
  if (!now || !startTimeStr || !endTimeStr) return false;
  const normStart = normalizeHHMM(startTimeStr);
  const normEnd = normalizeHHMM(endTimeStr);
  const [startH, startM] = normStart.split(':').map(Number);
  const [endH, endM] = normEnd.split(':').map(Number);
  
  const nowMinutes = now.getUTCHours() * 60 + now.getUTCMinutes();
  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;

  if (startMinutes > endMinutes) {
    // Overnight window (e.g. 22:30 to 06:00)
    return nowMinutes >= startMinutes || nowMinutes <= endMinutes;
  } else if (startMinutes < endMinutes) {
    // Normal window (e.g. 18:45 to 19:20)
    return nowMinutes >= startMinutes && nowMinutes <= endMinutes;
  } else {
    return false;
  }
}

function resolveScheduleForDate(scheduleRow, dateObj) {
  if (!scheduleRow) return { start_time: '00:00', end_time: '00:00', late_time: null, day_schedules: [] };

  const now = dateObj || getCurrentIST();
  const dayIdx = now.getUTCDay !== undefined ? now.getUTCDay() : now.getDay();
  const dayName = DAY_NAMES[dayIdx] || 'Mon';

  let daySchedules = null;
  if (scheduleRow.day_schedules) {
    try {
      daySchedules = typeof scheduleRow.day_schedules === 'string'
        ? JSON.parse(scheduleRow.day_schedules)
        : scheduleRow.day_schedules;
    } catch(e) {}
  }

  if (Array.isArray(daySchedules) && daySchedules.length > 0) {
    const matchedSlot = daySchedules.find(slot =>
      Array.isArray(slot.days) && slot.days.some(d => d && String(d).trim().toLowerCase().slice(0, 3) === dayName.toLowerCase().slice(0, 3))
    );

    if (matchedSlot) {
      const sTime = matchedSlot.startTime || matchedSlot.start_time;
      const eTime = matchedSlot.endTime || matchedSlot.end_time;
      const lTime = matchedSlot.lateTime !== undefined ? matchedSlot.lateTime : matchedSlot.late_time;

      if (sTime && eTime) {
        return {
          start_time: normalizeHHMM(sTime),
          end_time: normalizeHHMM(eTime),
          late_time: lTime ? normalizeHHMM(lTime) : null,
          day_schedules: daySchedules,
          matched_day: dayName,
          is_day_matched: true,
          is_active_today: true
        };
      }
    } else {
      // Session is NOT scheduled for today (e.g. only on Thursday)
      return {
        start_time: '00:00',
        end_time: '00:00',
        late_time: null,
        day_schedules: daySchedules,
        matched_day: dayName,
        is_day_matched: false,
        is_active_today: false
      };
    }
  }

  return {
    start_time: normalizeHHMM(scheduleRow.start_time || '21:00'),
    end_time: normalizeHHMM(scheduleRow.end_time || '21:30'),
    late_time: scheduleRow.late_time ? normalizeHHMM(scheduleRow.late_time) : null,
    day_schedules: Array.isArray(daySchedules) ? daySchedules : [],
    matched_day: dayName,
    is_day_matched: true,
    is_active_today: true
  };
}

// Construct start and end Date objects for DB recording
function getSessionDateTimes(sessionDateStr, startTimeStr, endTimeStr) {
  const normStart = normalizeHHMM(startTimeStr);
  const normEnd = normalizeHHMM(endTimeStr);
  const [startH, startM] = normStart.split(':').map(Number);
  const [endH, endM] = normEnd.split(':').map(Number);

  const y = parseInt(sessionDateStr.slice(0, 4), 10);
  const m = parseInt(sessionDateStr.slice(5, 7), 10) - 1;
  const d = parseInt(sessionDateStr.slice(8, 10), 10);

  const startDt = new Date(Date.UTC(y, m, d, startH, startM, 0));
  let endDt = new Date(Date.UTC(y, m, d, endH, endM, 0));
  if (startH * 60 + startM > endH * 60 + endM) {
    endDt = new Date(Date.UTC(y, m, d + 1, endH, endM, 0));
  }
  return { startDt, endDt };
}

module.exports = {
  normalizeHHMM,
  isTimeInWindow,
  resolveScheduleForDate,
  getSessionDateTimes
};
