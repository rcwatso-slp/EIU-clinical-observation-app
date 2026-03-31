// Date generation utilities for semester schedules

const DAY_MAP = {
  MW: [1, 3], // Monday = 1, Wednesday = 3
  TR: [2, 4], // Tuesday = 2, Thursday = 4
};

/**
 * Generate all session dates between start and end dates for the given day pattern.
 * @param {string} startDate - ISO date string (YYYY-MM-DD)
 * @param {string} endDate - ISO date string (YYYY-MM-DD)
 * @param {string} sessionDays - "MW" or "TR"
 * @returns {Array<{date: string, skipped: boolean}>}
 */
export function generateSchedule(startDate, endDate, sessionDays) {
  const days = DAY_MAP[sessionDays];
  if (!days) return [];

  const schedule = [];
  const start = new Date(startDate + 'T00:00:00');
  const end = new Date(endDate + 'T00:00:00');
  const current = new Date(start);

  while (current <= end) {
    if (days.includes(current.getDay())) {
      schedule.push({
        date: formatDate(current),
        skipped: false,
      });
    }
    current.setDate(current.getDate() + 1);
  }

  return schedule;
}

/**
 * Format a Date object to YYYY-MM-DD string.
 */
export function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Format a date string for display (e.g., "Mon 1/19").
 */
export function formatDateDisplay(dateStr) {
  const date = new Date(dateStr + 'T00:00:00');
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const day = dayNames[date.getDay()];
  return `${day} ${date.getMonth() + 1}/${date.getDate()}`;
}

/**
 * Format a date string for long display (e.g., "Monday, January 19, 2026").
 */
export function formatDateLong(dateStr) {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/**
 * Get today's date as YYYY-MM-DD.
 */
export function today() {
  return formatDate(new Date());
}

/**
 * Generate a UUID v4.
 */
export function uuid() {
  return crypto.randomUUID();
}
