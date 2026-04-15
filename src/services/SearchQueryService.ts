import { IndexField, FtFieldType } from '../shared/types';

interface RedisClient {
  call: (command: string, ...args: (string | number | Buffer)[]) => Promise<unknown>;
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

function parseRow(row: unknown): IndexField | null {
  if (!Array.isArray(row)) return null;
  const map: Record<string, string> = {};
  for (let i = 0; i < row.length - 1; i += 2) {
    map[toStr(row[i])] = toStr(row[i + 1]);
  }
  if (!map.attribute || !map.type) return null;
  if (!KNOWN_TYPES.has(map.type)) return null;
  return {
    name: map.attribute,
    type: map.type as FtFieldType,
    attribute: map.identifier ?? map.attribute,
  };
}
