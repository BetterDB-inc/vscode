import { IndexField, FtFieldType, ParsedSearchResponse, SearchResult, ParsedAggregateResponse } from '../shared/types';

interface RedisClient {
  call: (command: string, ...args: (string | number | Buffer)[]) => Promise<unknown>;
  callBuffer?: (command: string, ...args: (string | number | Buffer)[]) => Promise<unknown>;
}

const KNOWN_TYPES: ReadonlySet<string> = new Set(['TEXT', 'TAG', 'NUMERIC', 'VECTOR', 'GEO', 'GEOSHAPES']);

const toStr = (v: unknown): string => {
  if (typeof v === 'string') return v;
  if (Buffer.isBuffer(v)) return v.toString();
  return String(v);
};

export class SearchQueryService {
  async fetchIndexSchema(client: RedisClient, indexName: string): Promise<IndexField[]> {
    const raw = await client.call('FT.INFO', indexName);
    return parseAttributes(raw);
  }

  async fetchTagValues(client: RedisClient, indexName: string, fieldName: string): Promise<string[]> {
    const raw = await client.call('FT.TAGVALS', indexName, fieldName);
    if (!Array.isArray(raw)) return [];
    return raw.map(toStr);
  }

  async listIndexes(client: RedisClient): Promise<string[]> {
    const raw = await client.call('FT._LIST');
    if (!Array.isArray(raw)) return [];
    return raw.map(toStr);
  }

  async fetchVectorBytes(client: RedisClient, key: string, field: string): Promise<Buffer> {
    const fn = client.callBuffer ?? client.call;
    const raw = await fn.call(client, 'HGET', key, field);
    if (raw === null || raw === undefined) {
      throw new Error(`no vector bytes at ${key}.${field}`);
    }
    if (Buffer.isBuffer(raw)) return raw;
    if (typeof raw === 'string') return Buffer.from(raw, 'binary');
    throw new Error(`unexpected HGET response type for ${key}.${field}`);
  }
}

export function parseSearchResponse(raw: unknown): ParsedSearchResponse {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error('FT.SEARCH returned an unexpected response');
  }
  const total = Number(raw[0]);
  if (!Number.isFinite(total)) {
    throw new Error('FT.SEARCH total is not a number');
  }
  const hits: SearchResult[] = [];
  for (let i = 1; i < raw.length; i += 2) {
    const key = toStr(raw[i]);
    const fieldsRaw = raw[i + 1];
    const fields: Record<string, string> = {};
    if (Array.isArray(fieldsRaw)) {
      for (let j = 0; j < fieldsRaw.length - 1; j += 2) {
        fields[toStr(fieldsRaw[j])] = toStr(fieldsRaw[j + 1]);
      }
    }
    hits.push({ key, fields });
  }
  return { total, hits };
}

export function parseAggregateResponse(raw: unknown): ParsedAggregateResponse {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error('FT.AGGREGATE returned an unexpected response');
  }
  const total = Number(raw[0]);
  if (!Number.isFinite(total)) {
    throw new Error('FT.AGGREGATE total is not a number');
  }
  const rows: Record<string, string>[] = [];
  for (let i = 1; i < raw.length; i++) {
    const rowRaw = raw[i];
    const row: Record<string, string> = {};
    if (Array.isArray(rowRaw)) {
      for (let j = 0; j < rowRaw.length - 1; j += 2) {
        row[toStr(rowRaw[j])] = toStr(rowRaw[j + 1]);
      }
    }
    rows.push(row);
  }
  return { total, rows };
}

export function tokenizeCommand(line: string): string[] {
  const tokens: string[] = [];
  let i = 0;
  while (i < line.length) {
    while (i < line.length && /\s/.test(line[i])) i++;
    if (i >= line.length) break;
    let token = '';
    if (line[i] === '"') {
      i++;
      while (i < line.length && line[i] !== '"') {
        if (line[i] === '\\' && i + 1 < line.length) {
          token += line[i + 1];
          i += 2;
        } else {
          token += line[i++];
        }
      }
      if (line[i] === '"') i++;
    } else {
      while (i < line.length && !/\s/.test(line[i])) {
        token += line[i++];
      }
    }
    tokens.push(token);
  }
  return tokens;
}

export function parseInfoResponse(raw: unknown): Record<string, string> {
  if (!Array.isArray(raw)) {
    throw new Error('FT.INFO returned a non-array response');
  }
  const map: Record<string, string> = {};
  for (let i = 0; i < raw.length - 1; i += 2) {
    const key = toStr(raw[i]);
    const value = raw[i + 1];
    map[key] = Array.isArray(value) ? JSON.stringify(value) : toStr(value);
  }
  return map;
}

function parseAttributes(raw: unknown): IndexField[] {
  if (!Array.isArray(raw)) {
    throw new Error('FT.INFO returned a non-array response');
  }
  for (let i = 0; i < raw.length - 1; i += 2) {
    if (toStr(raw[i]) === 'attributes') {
      const list = raw[i + 1];
      if (!Array.isArray(list)) {
        throw new Error('FT.INFO attributes value is not an array');
      }
      return list.map(parseRow).filter((f): f is IndexField => f !== null);
    }
  }
  return [];
}

const FLAG_TOKENS: ReadonlySet<string> = new Set([
  'SORTABLE', 'UNF', 'NOINDEX', 'NOSTEM', 'CASESENSITIVE',
  'WITHSUFFIXTRIE', 'INDEXEMPTY', 'INDEXMISSING',
]);

function parseRow(row: unknown): IndexField | null {
  if (!Array.isArray(row)) return null;
  const map: Record<string, string> = {};
  const flags: string[] = [];

  const consumeKv = (arr: unknown[]): void => {
    let i = 0;
    while (i < arr.length) {
      const token = toStr(arr[i]);
      if (FLAG_TOKENS.has(token)) {
        flags.push(token);
        i += 1;
        continue;
      }
      if (i + 1 >= arr.length) { i += 1; continue; }
      const val = arr[i + 1];
      if (Array.isArray(val)) {
        if (token.toLowerCase() === 'algorithm') {
          for (let j = 0; j < val.length - 1; j += 2) {
            if (toStr(val[j]).toLowerCase() === 'name') {
              map.algorithm = toStr(val[j + 1]);
              break;
            }
          }
        } else {
          consumeKv(val);
        }
      } else {
        map[token] = toStr(val);
      }
      i += 2;
    }
  };

  consumeKv(row);

  if (!map.attribute || !map.type) return null;
  if (!KNOWN_TYPES.has(map.type)) return null;
  const field: IndexField = {
    name: map.attribute,
    type: map.type as FtFieldType,
    attribute: map.identifier ?? map.attribute,
    flags: flags.length > 0 ? flags : undefined,
  };

  if (field.type === 'VECTOR') {
    const dim = Number(map.DIM ?? map.dim ?? map.dimensions ?? map.DIMENSIONS);
    if (Number.isFinite(dim)) field.vectorDim = dim;
    const algo = (map.algorithm ?? map.ALGORITHM ?? '').toUpperCase();
    if (algo === 'HNSW' || algo === 'FLAT') field.vectorAlgorithm = algo;
    const metric = (map.DISTANCE_METRIC ?? map.distance_metric ?? '').toUpperCase();
    if (metric === 'COSINE' || metric === 'L2' || metric === 'IP') {
      field.vectorDistanceMetric = metric;
    }
  }

  return field;
}

export function parseInfoAttributes(raw: unknown): IndexField[] {
  return parseAttributes(raw);
}
