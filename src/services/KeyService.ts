import Valkey from 'iovalkey';
import { KeyInfo, KeyValue, KeyType } from '../models/key.model';
import { ScanResult } from '../models/types.model';
import { FtIndexInfo, FtFieldInfo, FtFieldType } from '../shared/types';
import { arrayToObject } from '../utils/helpers';
import { createError, ErrorCode } from '../utils/errors';

export class KeyService {
  private scanLock: Promise<void> = Promise.resolve();
  private scanAbortController: AbortController | null = null;
  private ftIndexCache: { list: string[]; schemas: Map<string, FtIndexInfo>; expiresAt: number } | null = null;
  private readonly FT_CACHE_TTL_MS = 30_000;

  constructor(private client: Valkey) {}

  async scanKeys(pattern: string = '*', count: number = 100): Promise<ScanResult> {
    const [cursor, keys] = await this.client.scan(0, 'MATCH', pattern, 'COUNT', count);
    return { keys, cursor };
  }

  async scanAllKeys(
    pattern: string = '*',
    limit: number = 1000,
    onProgress?: (scanned: number) => void
  ): Promise<string[]> {
    if (this.scanAbortController) {
      this.scanAbortController.abort();
    }

    this.scanAbortController = new AbortController();
    const signal = this.scanAbortController.signal;

    await this.scanLock;

    let resolveLock: () => void;
    this.scanLock = new Promise((resolve) => {
      resolveLock = resolve;
    });

    const seenKeys = new Set<string>();
    let cursor = '0';

    try {
      do {
        if (signal.aborted) {
          throw createError(ErrorCode.SCAN_FAILED, 'Scan was cancelled');
        }

        const [newCursor, keys] = await this.client.scan(
          cursor,
          'MATCH',
          pattern,
          'COUNT',
          Math.min(500, limit - seenKeys.size)
        );

        cursor = newCursor;

        for (const key of keys) {
          if (seenKeys.size >= limit) break;
          seenKeys.add(key);
        }

        if (onProgress) {
          onProgress(seenKeys.size);
        }
      } while (cursor !== '0' && seenKeys.size < limit);

      return Array.from(seenKeys);
    } finally {
      this.scanAbortController = null;
      resolveLock!();
    }
  }

  cancelScan(): void {
    if (this.scanAbortController) {
      this.scanAbortController.abort();
    }
  }

  async getKeyInfo(key: string): Promise<KeyInfo | null> {
    const type = await this.client.type(key);
    if (type === 'none') {
      return null;
    }

    const [ttl, size, encoding] = await Promise.all([
      this.client.ttl(key),
      this.client.memory('USAGE', key).catch(() => null),
      this.client.object('ENCODING', key).catch(() => null),
    ]);

    return {
      key,
      type: type as KeyType,
      ttl,
      size: size as number | undefined,
      encoding: encoding as string | undefined,
    };
  }

  async getValue(
    key: string,
    options?: { start?: number; end?: number; complete?: boolean }
  ): Promise<KeyValue | null> {
    const type = await this.client.type(key);
    if (type === 'none') {
      return null;
    }

    const ttl = await this.client.ttl(key);
    const complete = options?.complete ?? false;
    const start = options?.start ?? 0;
    const end = options?.end ?? 99;
    const count = end - start + 1;

    switch (type) {
      case 'string':
        return {
          key,
          type: 'string',
          ttl,
          value: { type: 'string', value: (await this.client.get(key)) || '' },
        };

      case 'hash': {
        const hashData = await this.client.hgetall(key);
        const fields = Object.entries(hashData).map(([field, value]) => ({ field, value }));
        return {
          key,
          type: 'hash',
          ttl,
          value: { type: 'hash', fields, total: fields.length },
        };
      }

      case 'list': {
        const [elements, total] = complete
          ? await this.client.lrange(key, 0, -1).then((els) => [els, els.length] as const)
          : await Promise.all([
              this.client.lrange(key, start, end),
              this.client.llen(key),
            ]);
        return {
          key,
          type: 'list',
          ttl,
          value: { type: 'list', elements, total },
        };
      }

      case 'set': {
        const [members, total] = complete
          ? await this.client.smembers(key).then((m) => [m, m.length] as const)
          : await Promise.all([
              this.client.sscan(key, 0, 'COUNT', count).then((r) => r[1]),
              this.client.scard(key),
            ]);
        return {
          key,
          type: 'set',
          ttl,
          value: { type: 'set', members, total },
        };
      }

      case 'zset': {
        const [raw, zsetCard] = complete
          ? await this.client.zrange(key, 0, -1, 'WITHSCORES').then((r) => [r, -1] as const)
          : await Promise.all([
              this.client.zrange(key, start, end, 'WITHSCORES'),
              this.client.zcard(key),
            ]);
        const members: Array<{ member: string; score: number }> = [];
        for (let i = 0; i < raw.length; i += 2) {
          members.push({ member: raw[i], score: parseFloat(raw[i + 1]) });
        }
        const total = complete ? members.length : zsetCard;
        return {
          key,
          type: 'zset',
          ttl,
          value: { type: 'zset', members, total },
        };
      }

      case 'stream': {
        const [streamEntries, streamLen] = complete
          ? await this.client.xrange(key, '-', '+').then((e) => [e, -1] as const)
          : await Promise.all([
              this.client.xrange(key, '-', '+', 'COUNT', count),
              this.client.xlen(key),
            ]);
        const length = complete ? streamEntries.length : streamLen;
        return {
          key,
          type: 'stream',
          ttl,
          value: {
            type: 'stream',
            entries: streamEntries.map(([id, fields]) => ({
              id,
              fields: arrayToObject(fields as string[]),
            })),
            length,
          },
        };
      }

      case 'ReJSON-RL': {
        const jsonValue = await this.getJson(key);
        return {
          key,
          type: 'json',
          ttl,
          value: { type: 'json', value: jsonValue || '{}' },
        };
      }

      default:
        return {
          key,
          type: 'unknown',
          ttl,
          value: { type: 'string', value: '[Unknown type]' },
        };
    }
  }

  async getCompleteValue(key: string): Promise<KeyValue | null> {
    return this.getValue(key, { complete: true });
  }

  async setString(key: string, value: string, ttl?: number): Promise<void> {
    if (ttl && ttl > 0) {
      await this.client.set(key, value, 'EX', ttl);
    } else {
      await this.client.set(key, value);
    }
  }

  async setHash(key: string, fields: Record<string, string>): Promise<void> {
    await this.client.del(key);
    if (Object.keys(fields).length > 0) {
      await this.client.hset(key, fields);
    }
  }

  async hashSet(key: string, field: string, value: string): Promise<void> {
    await this.client.hset(key, field, value);
  }

  async hashDelete(key: string, field: string): Promise<void> {
    await this.client.hdel(key, field);
  }

  async listPush(key: string, value: string, position: 'left' | 'right' = 'right'): Promise<void> {
    if (position === 'left') {
      await this.client.lpush(key, value);
    } else {
      await this.client.rpush(key, value);
    }
  }

  async listSet(key: string, index: number, value: string): Promise<void> {
    await this.client.lset(key, index, value);
  }

  async listRemove(key: string, index: number): Promise<void> {
    const placeholder = `__BETTERDB_DELETE_${Date.now()}__`;
    await this.client.lset(key, index, placeholder);
    await this.client.lrem(key, 1, placeholder);
  }

  async setList(key: string, elements: string[]): Promise<void> {
    await this.client.del(key);
    if (elements.length > 0) {
      await this.client.rpush(key, ...elements);
    }
  }

  async setAdd(key: string, members: string[]): Promise<void> {
    if (members.length > 0) {
      await this.client.sadd(key, ...members);
    }
  }

  async setRemove(key: string, members: string[]): Promise<void> {
    if (members.length > 0) {
      await this.client.srem(key, ...members);
    }
  }

  async setSet(key: string, members: string[]): Promise<void> {
    await this.client.del(key);
    if (members.length > 0) {
      await this.client.sadd(key, ...members);
    }
  }

  async zsetAdd(key: string, members: Array<{ score: number; member: string }>): Promise<void> {
    if (members.length === 0) return;
    const args: (string | number)[] = [];
    for (const { score, member } of members) {
      args.push(score, member);
    }
    await this.client.zadd(key, ...args);
  }

  async zsetRemove(key: string, members: string[]): Promise<void> {
    if (members.length > 0) {
      await this.client.zrem(key, ...members);
    }
  }

  async setZset(key: string, members: Array<{ score: number; member: string }>): Promise<void> {
    await this.client.del(key);
    if (members.length > 0) {
      const args: (string | number)[] = [];
      for (const { score, member } of members) {
        args.push(score, member);
      }
      await this.client.zadd(key, ...args);
    }
  }

  async streamAdd(key: string, fields: Record<string, string>, id: string = '*'): Promise<string> {
    const args: string[] = [];
    for (const [field, value] of Object.entries(fields)) {
      args.push(field, value);
    }
    const result = await this.client.xadd(key, id, ...args);
    return result || '';
  }

  async deleteKey(key: string): Promise<void> {
    await this.client.del(key);
  }

  async deleteKeys(keys: string[]): Promise<void> {
    if (keys.length > 0) {
      await this.client.del(...keys);
    }
  }

  async setTTL(key: string, ttl: number): Promise<void> {
    if (ttl > 0) {
      await this.client.expire(key, ttl);
    } else {
      await this.client.persist(key);
    }
  }

  async renameKey(oldKey: string, newKey: string): Promise<void> {
    await this.client.rename(oldKey, newKey);
  }

  async keyExists(key: string): Promise<boolean> {
    const exists = await this.client.exists(key);
    return exists === 1;
  }

  async executeCommand(command: string, ...args: string[]): Promise<unknown> {
    return (this.client as unknown as { call: (cmd: string, ...args: string[]) => Promise<unknown> }).call(
      command,
      ...args
    );
  }

  async getJson(key: string, path: string = '.'): Promise<string | null> {
    try {
      const result = await this.executeCommand('JSON.GET', key, path);
      if (result) {
        // Format the JSON for display
        return JSON.stringify(JSON.parse(result as string), null, 2);
      }
      return result as string;
    } catch (error) {
      console.warn(`Failed to get JSON for key "${key}":`, error);
      return null;
    }
  }

  async setJson(key: string, value: string, path: string = '.'): Promise<void> {
    await this.executeCommand('JSON.SET', key, path, value);
  }

  async hasJsonModule(): Promise<boolean> {
    try {
      const modules = await this.executeCommand('MODULE', 'LIST') as Array<unknown[]>;
      return modules.some((mod) => {
        // Module info is an array like ['name', 'ReJSON', 'ver', 20000, ...]
        const nameIndex = (mod as string[]).indexOf('name');
        if (nameIndex !== -1 && nameIndex + 1 < mod.length) {
          const name = (mod[nameIndex + 1] as string).toLowerCase();
          return name === 'json' || name === 'rejson' || name === 'redisjson';
        }
        return false;
      });
    } catch {
      // MODULE LIST may not be available or may fail - assume no JSON support
      return false;
    }
  }

  async hasSearchModule(): Promise<boolean> {
    try {
      const result = await this.executeCommand('FT._LIST');
      return Array.isArray(result);
    } catch {
      return false;
    }
  }

  async getSearchIndexList(): Promise<string[]> {
    const result = await this.executeCommand('FT._LIST');
    if (!Array.isArray(result)) {
      return [];
    }
    return result.map(String);
  }

  async getSearchIndexInfo(indexName: string): Promise<FtIndexInfo> {
    const raw = await this.executeCommand('FT.INFO', indexName) as unknown[];
    return this.parseFtInfo(indexName, raw);
  }

  async getIndexForKey(key: string): Promise<FtIndexInfo | null> {
    try {
      const cache = await this.getFtIndexSchemas();
      let bestMatch: FtIndexInfo | null = null;
      let bestPrefixLen = -1;
      let catchAll: FtIndexInfo | null = null;
      for (const indexName of cache.list) {
        const info = cache.schemas.get(indexName);
        if (!info) continue;
        if (info.prefixes.length === 0) {
          // Catch-all index — use as fallback if no prefix-specific match
          if (!catchAll) catchAll = info;
          continue;
        }
        for (const prefix of info.prefixes) {
          if (key.startsWith(prefix) && prefix.length > bestPrefixLen) {
            bestMatch = info;
            bestPrefixLen = prefix.length;
          }
        }
      }
      return bestMatch ?? catchAll;
    } catch {
      return null;
    }
  }

  clearFtCache(): void {
    this.ftIndexCache = null;
  }

  private async getFtIndexSchemas(): Promise<{ list: string[]; schemas: Map<string, FtIndexInfo> }> {
    if (this.ftIndexCache && Date.now() < this.ftIndexCache.expiresAt) {
      return this.ftIndexCache;
    }
    try {
      const list = await this.getSearchIndexList();
      const schemas = new Map<string, FtIndexInfo>();
      const results = await Promise.all(
        list.map(async (indexName) => {
          const info = await this.getSearchIndexInfo(indexName);
          return { indexName, info };
        })
      );
      for (const { indexName, info } of results) {
        schemas.set(indexName, info);
      }
      this.ftIndexCache = { list, schemas, expiresAt: Date.now() + this.FT_CACHE_TTL_MS };
      return this.ftIndexCache;
    } catch (err) {
      this.ftIndexCache = null;
      throw err;
    }
  }

  private parseFtInfo(indexName: string, raw: unknown[]): FtIndexInfo {
    if (raw.length % 2 !== 0) {
      console.warn(`FT.INFO for "${indexName}" returned odd-length array (${raw.length} elements) — last element dropped`);
    }
    const map = new Map<string, unknown>();
    for (let i = 0; i < raw.length - 1; i += 2) {
      map.set(String(raw[i]), raw[i + 1]);
    }

    const numDocs = Number(map.get('num_docs') ?? 0);

    let indexingState: 'indexed' | 'indexing' = 'indexing';
    const state = map.get('state');
    if (state !== undefined) {
      indexingState = state === 'ready' ? 'indexed' : 'indexing';
    } else {
      const indexing = map.get('indexing');
      indexingState = indexing === '0' || indexing === 0 ? 'indexed' : 'indexing';
    }

    let percentIndexed = 0;
    const backfill = map.get('backfill_complete_percent');
    const pctIndexed = map.get('percent_indexed');
    if (backfill !== undefined) {
      const val = Number(backfill);
      percentIndexed = val <= 1 ? val * 100 : val;
    } else if (pctIndexed !== undefined) {
      const val = Number(pctIndexed);
      percentIndexed = val <= 1 ? val * 100 : val;
    }

    let indexOn: 'HASH' | 'JSON' = 'HASH';
    let prefixes: string[] = [];
    const indexDef = map.get('index_definition');
    if (Array.isArray(indexDef)) {
      const defMap = new Map<string, unknown>();
      for (let i = 0; i < indexDef.length - 1; i += 2) {
        defMap.set(String(indexDef[i]), indexDef[i + 1]);
      }
      const keyType = defMap.get('key_type');
      if (keyType === 'JSON') {
        indexOn = 'JSON';
      }
      const pfx = defMap.get('prefixes');
      if (Array.isArray(pfx)) {
        prefixes = pfx.map(String);
      }
    }

    const fields: FtFieldInfo[] = [];
    const attributes = map.get('attributes');
    if (Array.isArray(attributes)) {
      for (const attr of attributes) {
        if (!Array.isArray(attr)) continue;
        const fieldMap = new Map<string, unknown>();
        for (let i = 0; i < attr.length - 1; i += 2) {
          fieldMap.set(String(attr[i]).toLowerCase(), attr[i + 1]);
        }

        const fieldName = String(fieldMap.get('identifier') ?? fieldMap.get('attribute') ?? '');
        const fieldType = (String(fieldMap.get('type') ?? 'TEXT').toUpperCase()) as FtFieldType;

        const field: FtFieldInfo = { name: fieldName, type: fieldType };

        if (fieldType === 'VECTOR') {
          const indexArr = fieldMap.get('index');
          const vecMap = new Map<string, unknown>();
          let algorithmArr: unknown[] | null = null;
          if (Array.isArray(indexArr)) {
            for (let i = 0; i < indexArr.length - 1; i += 2) {
              const key = String(indexArr[i]).toLowerCase();
              const value = indexArr[i + 1];
              if (Array.isArray(value)) {
                if (key === 'algorithm') {
                  algorithmArr = value;
                }
                continue;
              }
              vecMap.set(key, value);
            }
          }
          field.vectorDimension = Number(vecMap.get('dimensions') ?? vecMap.get('dim') ?? 0) || undefined;
          const metric = vecMap.get('distance_metric');
          field.vectorDistanceMetric = metric !== null && metric !== undefined ? String(metric) : undefined;
          if (algorithmArr) {
            const algoMap = new Map<string, unknown>();
            for (let i = 0; i < algorithmArr.length - 1; i += 2) {
              algoMap.set(String(algorithmArr[i]).toLowerCase(), algorithmArr[i + 1]);
            }
            const algoName = algoMap.get('name');
            field.vectorAlgorithm = algoName !== null && algoName !== undefined ? String(algoName) : undefined;
          }
        }

        fields.push(field);
      }
    }

    return {
      name: indexName,
      numDocs,
      indexingState,
      percentIndexed,
      fields,
      indexOn,
      prefixes,
    };
  }
}
