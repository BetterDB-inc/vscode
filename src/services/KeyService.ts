import Valkey from 'iovalkey';
import { KeyInfo, KeyValue, KeyType } from '../models/key.model';
import { ScanResult } from '../models/types.model';
import { arrayToObject } from '../utils/helpers';
import { createError, ErrorCode } from '../utils/errors';

export class KeyService {
  private scanLock: Promise<void> = Promise.resolve();
  private scanAbortController: AbortController | null = null;

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

  async getValue(key: string, options?: { start?: number; end?: number }): Promise<KeyValue | null> {
    const type = await this.client.type(key);
    if (type === 'none') {
      return null;
    }

    const ttl = await this.client.ttl(key);
    const start = options?.start ?? 0;
    const end = options?.end ?? 99;

    switch (type) {
      case 'string':
        return {
          key,
          type: 'string',
          value: { type: 'string', value: (await this.client.get(key)) || '' },
          ttl,
        };

      case 'hash': {
        const [hashLen, hashData] = await Promise.all([
          this.client.hlen(key),
          this.client.hgetall(key),
        ]);
        return {
          key,
          type: 'hash',
          ttl,
          value: {
            type: 'hash',
            fields: Object.entries(hashData).map(([field, value]) => ({ field, value })),
            total: hashLen,
          },
        };
      }

      case 'list': {
        const [listLen, listElements] = await Promise.all([
          this.client.llen(key),
          this.client.lrange(key, start, end),
        ]);
        return {
          key,
          type: 'list',
          ttl,
          value: { type: 'list', elements: listElements, total: listLen },
        };
      }

      case 'set': {
        const setLen = await this.client.scard(key);
        const setMembers = await this.client.sscan(key, 0, 'COUNT', end - start + 1);
        return {
          key,
          type: 'set',
          ttl,
          value: { type: 'set', members: setMembers[1], total: setLen },
        };
      }

      case 'zset': {
        const [zsetLen, zsetMembers] = await Promise.all([
          this.client.zcard(key),
          this.client.zrange(key, start, end, 'WITHSCORES'),
        ]);
        const members: Array<{ member: string; score: number }> = [];
        for (let i = 0; i < zsetMembers.length; i += 2) {
          members.push({
            member: zsetMembers[i],
            score: parseFloat(zsetMembers[i + 1]),
          });
        }
        return {
          key,
          type: 'zset',
          ttl,
          value: { type: 'zset', members, total: zsetLen },
        };
      }

      case 'stream': {
        const [streamLen, streamEntries] = await Promise.all([
          this.client.xlen(key),
          this.client.xrange(key, '-', '+', 'COUNT', end - start + 1),
        ]);
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
            length: streamLen,
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
          value: { type: 'string', value: '[Unknown type]' },
          ttl,
        };
    }
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
}
