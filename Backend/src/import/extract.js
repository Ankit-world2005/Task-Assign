// Turns an uploaded spreadsheet (.xlsx, HTML-table .xls, or CSV) into row records keyed by task field.
import ExcelJS from 'exceljs';
import { pyStr } from '../lib/py.js';
import { parseCsv } from './csv.js';
import { parseHtmlTableRows } from './htmlTable.js';

// Accepted column headers per task field, compared after lower-casing and removing non-alphanumerics.
const KEY_MAPPINGS = {
  task_id: ['taskid', 'taskcode', 'tasknumber', 'code', 'id'],
  category: ['category', 'taskcategory', 'type', 'tasktype'],
  task_name: ['taskname', 'task', 'name', 'title'],
  project_name: ['projectname', 'project', 'client'],
  insurance_name: ['insurancename', 'insurancepayer', 'insurance', 'payer'],
  provider_name: ['providername', 'provider', 'doctor', 'physician'],
  provider_effective_date: ['providereffectivedate', 'effective', 'effectivedate'],
  early_start_date: ['earlystartdate', 'startdate', 'earlystart'],
  creation_date: ['creationdate', 'createddate', 'datecreated', 'date'],
  group_ptan: ['groupptan', 'groupptanid', 'gptan', 'gptanid'],
  individual_ptan: ['individualptan', 'individualptanid', 'pptan', 'pptanid'],
  sub_plan: ['subplan', 'plan', 'subinsurance'],
  follow_up_type: ['followuptype', 'moc', 'modeofcontact', 'contacttype', 'typeoffollowup'],
  follow_up_value: ['followupvalue', 'remarks', 'remark', 'contactinfo', 'phoneemail', 'detail'],
  status: ['status', 'state', 'taskstatus'],
  notes: ['notes', 'note', 'comments', 'comment', 'description'],
  assignee: ['assignee', 'assignedto', 'owner', 'assigneduser', 'assingeduser', 'user', 'staff'],
  file_name: ['filename', 'file', 'nameoffile'],
  num_files_ppt: ['numberoffileforppt', 'numberoffilesforppt', 'numfilesppt', 'filesppt', 'numberoffile'],
  denials_ss: ['denialsss', 'denials', 'denial'],
  remaining: ['remaining', 'remain'],
  approx_time_min: ['approxtimemin', 'approxtime', 'estimatedtime', 'estimatedtimemin'],
  final_time_user: ['finaltimebyuser', 'finaltime', 'usertime', 'actualtime'],
  remarks: ['remarks', 'remark'],
  sup_qa: ['supqa', 'qa', 'supervisorqa'],
  time_by_manish: ['timebymanish', 'manishtime', 'manish'],
};

function fieldForHeader(header) {
  const normalized = pyStr(header).toLowerCase().replace(/[^a-z0-9]/g, '');
  for (const [field, aliases] of Object.entries(KEY_MAPPINGS)) {
    if (aliases.includes(normalized)) return field;
  }
  return null;
}

/** First row that looks like a header: 2+ known column names, or 3+ cells within the first 11 rows. */
function findHeaderIndex(rows, cellsOf) {
  for (let idx = 0; idx < rows.length; idx++) {
    const cells = cellsOf(rows[idx]);
    const matched = cells.filter((cell) => fieldForHeader(cell)).length;
    if (matched >= 2 || (cells.length >= 3 && idx <= 10)) return idx;
  }
  return -1;
}

/** Records (Maps) for the rows below the header; unknown columns keep their header text as key. */
function buildRecords(rows, headerIndex, headerRow, isBlank) {
  const records = [];
  if (headerIndex === -1) return records;
  for (const row of rows.slice(headerIndex + 1)) {
    if (isBlank(row)) continue;
    const record = new Map();
    const width = Math.min(headerRow.length, row.length);
    for (let i = 0; i < width; i++) record.set(fieldForHeader(headerRow[i]) ?? headerRow[i], row[i]);
    records.push(record);
  }
  return records;
}

/** A cell's value: the cached result for formulas, plain text for rich text and links. */
function cellValue(value) {
  if (value === null || value === undefined) return null;
  if (value instanceof Date || typeof value !== 'object') return value;
  if ('formula' in value || 'sharedFormula' in value) return cellValue(value.result ?? null);
  if (Array.isArray(value.richText)) return value.richText.map((part) => part.text).join('');
  if ('hyperlink' in value) return cellValue(value.text);
  if ('error' in value) return value.error;
  return null;
}

async function readXlsxRows(buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheets = workbook.worksheets;
  const sheet = sheets[workbook.views?.[0]?.activeTab ?? 0] ?? sheets[0];
  if (!sheet) return [];
  const rows = [];
  for (let r = 1; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const values = [];
    for (let c = 1; c <= sheet.columnCount; c++) {
      const cell = row.getCell(c);
      // Only the top-left cell of a merged range holds the value.
      values.push(cell.type === ExcelJS.ValueType.Merge ? null : cellValue(cell.value));
    }
    rows.push(values);
  }
  return rows;
}

function decodeText(buffer) {
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(buffer);
  } catch {
    return buffer.toString('latin1');
  }
}

const hasText = (cell) => cell !== null && pyStr(cell).trim() !== '';

export async function extractRecords({ filename, buffer }) {
  // 1. XLSX (by extension or ZIP signature).
  if (filename.toLowerCase().endsWith('.xlsx') || buffer.subarray(0, 4).equals(Buffer.from('PK\x03\x04', 'latin1'))) {
    const rows = await readXlsxRows(buffer);
    const headerIndex = findHeaderIndex(rows, (row) => row.filter(hasText));
    const headerRow = headerIndex === -1 ? [] : rows[headerIndex].map((c, i) => (c === null ? `col_${i}` : pyStr(c).trim()));
    return buildRecords(rows, headerIndex, headerRow, (row) => !row.some(hasText));
  }

  // 2. HTML/XML table, often saved with an .xls extension.
  const preview = buffer.subarray(0, 500).toString('latin1').toLowerCase();
  if (['<html', '<table', '<!doctype', '<?xml'].some((marker) => preview.includes(marker))) {
    const rows = parseHtmlTableRows(decodeText(buffer));
    const headerIndex = findHeaderIndex(rows, (row) => row);
    const headerRow = headerIndex === -1 ? [] : rows[headerIndex].map((c) => c.trim());
    return buildRecords(rows, headerIndex, headerRow, (row) => !row.some((c) => c.trim()));
  }

  // 3. CSV / plain text.
  const rows = parseCsv(decodeText(buffer));
  const headerIndex = findHeaderIndex(rows, (row) => row);
  const headerRow = headerIndex === -1 ? [] : rows[headerIndex].map((c) => c.trim());
  return buildRecords(rows, headerIndex, headerRow, (row) => !row.some((c) => c.trim()));
}
