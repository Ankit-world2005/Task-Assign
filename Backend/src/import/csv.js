// CSV reading and writing that behaves like Python's csv module (default "excel" dialect),
// so imports and exports parse and quote exactly as before.

const FIELD_LIMIT = 131072; // Python's default csv.field_size_limit()

const START_RECORD = 0;
const START_FIELD = 1;
const IN_FIELD = 2;
const IN_QUOTED_FIELD = 3;
const QUOTE_IN_QUOTED_FIELD = 4;
const EAT_CRNL = 5;
const EOL = null; // end-of-line marker fed after every line, as Python's parser does

/** Parses CSV text into rows of strings; blank lines come back as []. */
export function parseCsv(text) {
  const rows = [];
  let fields = [];
  let field = '';
  let fieldLength = 0;
  let state = START_RECORD;

  const addChar = (c) => {
    if (fieldLength >= FIELD_LIMIT) throw new Error(`field larger than field limit (${FIELD_LIMIT})`);
    field += c;
    fieldLength += 1;
  };
  const saveField = () => {
    fields.push(field);
    field = '';
    fieldLength = 0;
  };
  const isNewline = (c) => c === '\n' || c === '\r';

  const processChar = (c) => {
    switch (state) {
      case START_RECORD:
        if (c === EOL) return;
        if (isNewline(c)) {
          state = EAT_CRNL;
          return;
        }
        state = START_FIELD;
      // falls through
      case START_FIELD:
        if (c === EOL || isNewline(c)) {
          saveField();
          state = c === EOL ? START_RECORD : EAT_CRNL;
        } else if (c === '"') {
          state = IN_QUOTED_FIELD;
        } else if (c === ',') {
          saveField();
        } else {
          addChar(c);
          state = IN_FIELD;
        }
        return;
      case IN_FIELD:
        if (c === EOL || isNewline(c)) {
          saveField();
          state = c === EOL ? START_RECORD : EAT_CRNL;
        } else if (c === ',') {
          saveField();
          state = START_FIELD;
        } else {
          addChar(c);
        }
        return;
      case IN_QUOTED_FIELD:
        if (c === EOL) return;
        if (c === '"') state = QUOTE_IN_QUOTED_FIELD;
        else addChar(c);
        return;
      case QUOTE_IN_QUOTED_FIELD:
        if (c === '"') {
          addChar(c);
          state = IN_QUOTED_FIELD;
        } else if (c === ',') {
          saveField();
          state = START_FIELD;
        } else if (c === EOL || isNewline(c)) {
          saveField();
          state = c === EOL ? START_RECORD : EAT_CRNL;
        } else {
          addChar(c);
          state = IN_FIELD;
        }
        return;
      case EAT_CRNL:
        if (isNewline(c)) return;
        if (c === EOL) {
          state = START_RECORD;
          return;
        }
        throw new Error("new-line character seen in unquoted field - do you need to open the file with newline=''?");
      default:
        throw new Error(`bad CSV parser state ${state}`);
    }
  };

  // Lines split after '\n'; a record is complete once a line ends back in START_RECORD.
  for (const line of text.match(/[^\n]*\n|[^\n]+$/g) ?? []) {
    for (const c of line) processChar(c);
    processChar(EOL);
    if (state === START_RECORD) {
      rows.push(fields);
      fields = [];
    }
  }
  if (fieldLength !== 0 || state === IN_QUOTED_FIELD) {
    saveField();
    rows.push(fields);
  }
  return rows;
}

function formatCsvField(value) {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** One CSV row, quoted only where needed, ending in '\r\n'. */
export function formatCsvRow(values) {
  return `${values.map(formatCsvField).join(',')}\r\n`;
}
