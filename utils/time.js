'use strict';

function toValidDate(input) {
  const date = input instanceof Date ? input : new Date(input);

  if (Number.isNaN(date.getTime())) {
    throw new TypeError('Invalid date');
  }

  return date;
}

function formatISO8601(input = new Date()) {
  return toValidDate(input).toISOString();
}

module.exports = { formatISO8601 };
