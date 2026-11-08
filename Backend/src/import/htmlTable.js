// Table-cell extraction for HTML spreadsheets (the "Excel" .xls files the app exports),
// handling markup the same way the original HTML parser did.
import { decodeHTML } from 'entities';

/** End of a start tag, skipping '>' inside quoted attribute values. */
function findTagEnd(html, from) {
  let quote = null;
  for (let i = from; i < html.length; i++) {
    const c = html[i];
    if (quote) {
      if (c === quote) quote = null;
    } else if (c === '"' || c === "'") {
      quote = c;
    } else if (c === '>') {
      return i;
    }
  }
  return -1;
}

const tagName = (text) => /^[^\s/>\0]+/.exec(text)?.[0].toLowerCase() ?? '';
const isLetter = (c) => c !== undefined && /[a-zA-Z]/.test(c);

/** Rows of cell text for every <tr> that contained cells. */
export function parseHtmlTableRows(html) {
  const rows = [];
  let currentRow = [];
  let currentCell = [];
  let inCell = false;

  const startTag = (tag) => {
    if (tag === 'td' || tag === 'th') {
      inCell = true;
      currentCell = [];
    } else if (tag === 'tr') {
      currentRow = [];
    }
  };
  const endTag = (tag) => {
    if (tag === 'td' || tag === 'th') {
      inCell = false;
      currentRow.push(currentCell.join('').trim());
    } else if (tag === 'tr' && currentRow.length) {
      rows.push(currentRow);
    }
  };
  const text = (value) => {
    if (inCell) currentCell.push(value);
  };

  let i = 0;
  let textStart = 0;
  const flushText = (end) => {
    if (end > textStart) text(decodeHTML(html.slice(textStart, end)));
  };

  while (i < html.length) {
    const lt = html.indexOf('<', i);
    if (lt === -1) break;
    const next = html[lt + 1];
    if (isLetter(next)) {
      const end = findTagEnd(html, lt + 1);
      if (end === -1) break;
      flushText(lt);
      const inner = html.slice(lt + 1, end);
      const tag = tagName(inner);
      const selfClosing = inner.endsWith('/');
      startTag(tag);
      if (selfClosing) endTag(tag);
      i = textStart = end + 1;
      if (!selfClosing && (tag === 'script' || tag === 'style')) {
        // Raw text up to the closing tag, not entity-decoded.
        const close = html.toLowerCase().indexOf(`</${tag}`, i);
        const stop = close === -1 ? html.length : close;
        if (stop > i) text(html.slice(i, stop));
        i = textStart = stop;
      }
    } else if (next === '/' && isLetter(html[lt + 2])) {
      const end = html.indexOf('>', lt);
      if (end === -1) break;
      flushText(lt);
      endTag(tagName(html.slice(lt + 2, end)));
      i = textStart = end + 1;
    } else if (html.startsWith('<!--', lt)) {
      flushText(lt);
      const end = html.indexOf('-->', lt + 4);
      if (end === -1) return rows;
      i = textStart = end + 3;
    } else if (next === '!' || next === '?') {
      flushText(lt);
      const end = html.indexOf('>', lt);
      if (end === -1) return rows;
      i = textStart = end + 1;
    } else {
      i = lt + 1; // a lone '<' is ordinary text
    }
  }
  flushText(html.length);
  return rows;
}
