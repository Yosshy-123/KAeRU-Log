'use strict';

function pad(n) {
  return String(n).padStart(2, '0');
}

function toJST(date) {
  return new Date(date.getTime() + 9 * 60 * 60 * 1000);
}

function formatJST(date = new Date(), withSeconds = false) {
  const jst = toJST(date);
  const yyyy = jst.getUTCFullYear();
  const mm = pad(jst.getUTCMonth() + 1);
  const dd = pad(jst.getUTCDate());
  const hh = pad(jst.getUTCHours());
  const mi = pad(jst.getUTCMinutes());

  if (withSeconds) {
    const ss = pad(jst.getUTCSeconds());
    return `${yyyy}/${mm}/${dd} ${hh}:${mi}:${ss}`;
  }
  return `${yyyy}/${mm}/${dd} ${hh}:${mi}`;
}

module.exports = { pad, toJST, formatJST };