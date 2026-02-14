'use strict';

/**
 * Pad a number with leading zero
 * @param {number} n - Number to pad
 * @returns {string} Padded number string
 */
function pad(n) {
  return String(n).padStart(2, '0');
}

/**
 * Format date to JST timezone string
 * Uses Intl API for proper timezone conversion instead of manual calculations
 * @param {Date} date - Date to format (defaults to current date)
 * @param {boolean} withSeconds - Include seconds in output
 * @returns {string} Formatted date string in YYYY/MM/DD HH:MM or YYYY/MM/DD HH:MM:SS format
 */
function formatJST(date = new Date(), withSeconds = false) {
  const formatter = new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: withSeconds ? '2-digit' : undefined,
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const values = {};

  parts.forEach(({ type, value }) => {
    values[type] = value;
  });

  if (withSeconds) {
    return `${values.year}/${values.month}/${values.day} ${values.hour}:${values.minute}:${values.second}`;
  }
  return `${values.year}/${values.month}/${values.day} ${values.hour}:${values.minute}`;
}

/**
 * Get current date in JST timezone
 * @param {Date} date - Date to convert (defaults to current date)
 * @returns {Date} Date object in JST (note: Date objects are always in UTC internally)
 */
function toJST(date = new Date()) {
  // For compatibility, we return a Date object
  // However, the recommended approach is to use formatJST directly
  return date;
}

module.exports = { pad, toJST, formatJST };