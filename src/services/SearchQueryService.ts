import { IndexField, FtFieldType } from '../shared/types';

interface RedisClient {
  call: (...args: unknown[]) => Promise<unknown>;
}

export class SearchQueryService {
  async fetchIndexSchema(client: RedisClient, indexName: string): Promise<IndexField[]> {
    const raw = await client.call('FT.INFO', indexName);
    return parseAttributes(raw);
  }

  async fetchTagValues(client: RedisClient, indexName: string, fieldName: string): Promise<string[]> {
    const raw = await client.call('FT.TAGVALS', indexName, fieldName);
    if (!Array.isArray(raw)) return [];
    return (raw as string[]).slice();
  }

  async listIndexes(client: RedisClient): Promise<string[]> {
    const raw = await client.call('FT._LIST');
    return Array.isArray(raw) ? (raw as string[]) : [];
  }
}

function parseAttributes(raw: unknown): IndexField[] {
  if (!Array.isArray(raw)) return [];
  const idx = raw.findIndex((v, i) => i % 2 === 0 && v === 'attributes');
  if (idx === -1) return [];
  const list = raw[idx + 1];
  if (!Array.isArray(list)) return [];
  return (list as unknown[][]).map((row) => parseRow(row)).filter(Boolean) as IndexField[];
}

function parseRow(row: unknown[]): IndexField | null {
  const map: Record<string, string> = {};
  for (let i = 0; i < row.length; i += 2) {
    map[String(row[i])] = String(row[i + 1]);
  }
  if (!map.attribute || !map.type) return null;
  return {
    name: map.attribute,
    type: map.type as FtFieldType,
    attribute: map.identifier ?? map.attribute,
  };
}
