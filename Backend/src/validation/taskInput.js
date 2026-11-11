// Task create/update validation with the original serializer's rules: same fields, defaults,
// partial-update (PATCH) behaviour and error messages.
import { charLength, isPlainObject, isTruthy, pyInt, pyStr, pyTypeName } from '../lib/py.js';
import { parseIsoDate } from '../lib/time.js';
import { CATEGORY_CHOICES, FOLLOW_UP_CHOICES, PORTAL_CREDENTIAL_CATEGORIES, STATUS_CHOICES } from '../models/tasks.js';
import { getUserById } from '../models/users.js';

const optionalText = { type: 'char', required: false, allowBlank: true, allowNull: true, default: '' };
const optionalDate = { type: 'date', required: false, allowNull: true };
const optionalUser = { type: 'user', required: false, allowNull: true };

// Writable fields in serializer order. Portal credentials and the follow-up schedule are
// read-only here (only add-log sets them), and created_by is always the signed-in creator.
const FIELDS = [
  ['task_id', optionalText],
  ['category', { type: 'choice', choices: Object.keys(CATEGORY_CHOICES), required: false }],
  ['project_name', { type: 'char', required: true, maxLength: 255 }],
  ['task_name', { type: 'char', required: true, maxLength: 255 }],
  ['provider_name', optionalText],
  ['provider_effective_date', optionalDate],
  ['group_ptan', optionalText],
  ['individual_ptan', optionalText],
  ['early_start_date', optionalDate],
  ['sub_plan', optionalText],
  ['insurance_name', { type: 'char', required: true, maxLength: 255 }],
  ['creation_date', optionalDate],
  ['assignee', optionalUser],
  ['follow_up_type', { type: 'choice', choices: Object.keys(FOLLOW_UP_CHOICES), required: false }],
  ['follow_up_value', optionalText],
  ['status', { type: 'choice', choices: STATUS_CHOICES, required: false }],
  ['notes', optionalText],
  ['attachment', optionalText],
];

const SKIP = Symbol('skip');

class FieldError extends Error {}
const fail = (message) => {
  throw new FieldError(message);
};

const isEmptyDate = (value) => value === undefined || value === null || value === '' || value === 'null';

/** The serializer's pre-processing of incoming data. */
function preprocess(input) {
  const data = { ...input };
  for (const field of ['provider_effective_date', 'early_start_date']) {
    if (isEmptyDate(data[field])) data[field] = null;
  }
  if (isEmptyDate(data.creation_date)) delete data.creation_date;
  for (const field of ['provider_name', 'group_ptan', 'individual_ptan', 'sub_plan', 'follow_up_value', 'notes', 'attachment', 'task_id', 'task_name']) {
    if (field in data && data[field] === null) data[field] = '';
  }
  if (!isTruthy(data.task_name)) data.task_name = 'project_name' in data ? data.project_name : 'Task';
  return data;
}

async function runField(db, spec, present, value, partial) {
  if (spec.type === 'char' && present && value !== null && pyStr(value).trim() === '') {
    if (!spec.allowBlank) fail('This field may not be blank.');
    return '';
  }
  if (spec.type === 'user' && value === '') value = null;

  if (!present) {
    if (partial) return SKIP;
    if (spec.required) fail('This field is required.');
    return 'default' in spec ? spec.default : SKIP;
  }
  if (value === null) {
    if (!spec.allowNull) fail('This field may not be null.');
    return null;
  }

  switch (spec.type) {
    case 'char': {
      if (typeof value !== 'string' && typeof value !== 'number') fail('Not a valid string.');
      const text = pyStr(value).trim();
      if (spec.maxLength && charLength(text) > spec.maxLength) {
        fail(`Ensure this field has no more than ${spec.maxLength} characters.`);
      }
      if (text.includes('\0')) fail('Null characters are not allowed.');
      return text;
    }
    case 'choice': {
      const text = pyStr(value);
      if (!spec.choices.includes(text)) fail(`"${text}" is not a valid choice.`);
      return text;
    }
    case 'date': {
      const parsed = parseIsoDate(value);
      if (!parsed) fail('Date has wrong format. Use one of these formats instead: YYYY-MM-DD.');
      return parsed;
    }
    case 'user': {
      const id = typeof value === 'boolean' ? null : pyInt(value);
      if (id === null) fail(`Incorrect type. Expected pk value, received ${pyTypeName(value)}.`);
      if (!(await getUserById(db, id))) fail(`Invalid pk "${pyStr(value)}" - object does not exist.`);
      return id;
    }
    default:
      throw new Error(`Unknown field type ${spec.type}`);
  }
}

/**
 * Validates a task create/update payload.
 * Returns { errors } (the API error body) or { values } (task columns to write).
 */
export async function validateTaskInput(db, input, { instance = null, partial = false } = {}) {
  if (!isPlainObject(input)) {
    return { errors: { non_field_errors: [`Invalid data. Expected a dictionary, but got ${pyTypeName(input)}.`] } };
  }
  const data = preprocess(input);
  const attrs = {};
  const errors = {};
  for (const [name, spec] of FIELDS) {
    try {
      const value = await runField(db, spec, name in data, data[name], partial);
      if (value !== SKIP) attrs[name] = value;
    } catch (err) {
      if (!(err instanceof FieldError)) throw err;
      errors[name] = [err.message];
    }
  }
  if (Object.keys(errors).length) return { errors };

  // Portal creation / password reset tasks can't be approved by a plain create or edit.
  const category = 'category' in attrs ? attrs.category : instance?.category ?? null;
  const status = 'status' in attrs ? attrs.status : instance?.status ?? null;
  const becomingApproved = status === 'Approved' && instance?.status !== 'Approved';
  if (becomingApproved && PORTAL_CREDENTIAL_CATEGORIES.includes(category)) {
    return {
      errors: {
        detail: [
          'Approve portal creation and password reset tasks with Add Update so the Portal Link, User ID and Password are recorded.',
        ],
      },
    };
  }

  const values = { ...attrs };
  if ('assignee' in values) {
    values.assignee_id = values.assignee;
    delete values.assignee;
  }
  return { values };
}
