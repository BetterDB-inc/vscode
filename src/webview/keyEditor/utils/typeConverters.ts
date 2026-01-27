import { HashValue, ListValue, SetValue, ZSetValue } from '../types';

export interface ConversionResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

function parseJson<T>(json: string): ConversionResult<T> {
  try {
    return { success: true, data: JSON.parse(json) as T };
  } catch (e) {
    return { success: false, error: `Invalid JSON: ${(e as Error).message}` };
  }
}

function jsonToStringArray(json: string, dedupe = false): ConversionResult<string[]> {
  const result = parseJson<unknown[]>(json);
  if (!result.success) return result as ConversionResult<string[]>;

  const parsed = result.data!;
  if (!Array.isArray(parsed)) {
    return { success: false, error: 'JSON must be an array of strings' };
  }

  for (let i = 0; i < parsed.length; i++) {
    if (typeof parsed[i] !== 'string') {
      return { success: false, error: `Element at index ${i} must be a string` };
    }
  }

  const data = dedupe ? [...new Set(parsed as string[])] : (parsed as string[]);
  return { success: true, data };
}

export function hashToJson(fields: HashValue['fields']): string {
  const obj: Record<string, string> = {};
  for (const { field, value } of fields) {
    obj[field] = value;
  }
  return JSON.stringify(obj, null, 2);
}

export function jsonToHash(json: string): ConversionResult<HashValue['fields']> {
  const result = parseJson<Record<string, unknown>>(json);
  if (!result.success) return result as ConversionResult<HashValue['fields']>;

  const parsed = result.data!;
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { success: false, error: 'JSON must be an object with string values' };
  }

  const fields: HashValue['fields'] = [];
  for (const [field, value] of Object.entries(parsed)) {
    if (typeof value !== 'string') {
      return { success: false, error: `Field "${field}" must be a string value` };
    }
    fields.push({ field, value });
  }
  return { success: true, data: fields };
}

export function listToJson(elements: string[]): string {
  return JSON.stringify(elements, null, 2);
}

export function jsonToList(json: string): ConversionResult<string[]> {
  return jsonToStringArray(json, false);
}

export function setToJson(members: string[]): string {
  return JSON.stringify(members, null, 2);
}

export function jsonToSet(json: string): ConversionResult<string[]> {
  return jsonToStringArray(json, true);
}

export function zsetToJson(members: ZSetValue['members']): string {
  return JSON.stringify(members, null, 2);
}

export function jsonToZset(json: string): ConversionResult<ZSetValue['members']> {
  const result = parseJson<unknown[]>(json);
  if (!result.success) return result as ConversionResult<ZSetValue['members']>;

  const parsed = result.data!;
  if (!Array.isArray(parsed)) {
    return { success: false, error: 'JSON must be an array of {member, score} objects' };
  }

  const members: ZSetValue['members'] = [];
  for (let i = 0; i < parsed.length; i++) {
    const item = parsed[i] as Record<string, unknown>;
    if (typeof item !== 'object' || item === null) {
      return { success: false, error: `Element at index ${i} must be an object` };
    }
    if (typeof item.member !== 'string') {
      return { success: false, error: `Element at index ${i}: "member" must be a string` };
    }
    if (typeof item.score !== 'number') {
      return { success: false, error: `Element at index ${i}: "score" must be a number` };
    }
    members.push({ member: item.member, score: item.score });
  }
  return { success: true, data: members };
}

export function valueToJson(type: string, value: unknown): string {
  switch (type) {
    case 'hash':
      return hashToJson((value as HashValue).fields);
    case 'list':
      return listToJson((value as ListValue).elements);
    case 'set':
      return setToJson((value as SetValue).members);
    case 'zset':
      return zsetToJson((value as ZSetValue).members);
    default:
      return '';
  }
}

export function jsonToValue(type: string, json: string): ConversionResult<unknown> {
  switch (type) {
    case 'hash':
      return jsonToHash(json);
    case 'list':
      return jsonToList(json);
    case 'set':
      return jsonToSet(json);
    case 'zset':
      return jsonToZset(json);
    default:
      return { success: false, error: `Unsupported type: ${type}` };
  }
}
