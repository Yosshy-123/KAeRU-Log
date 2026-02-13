'use strict';

const createDOMPurify = require('dompurify');
const { JSDOM } = require('jsdom');
const window = new JSDOM('').window;
const DOMPurify = createDOMPurify(window);

function escapeHTML(str = '') {
  return DOMPurify.sanitize(String(str), { ALLOWED_TAGS: [] });
}

module.exports = { escapeHTML };