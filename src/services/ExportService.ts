import * as fs from 'fs';
import Valkey from 'iovalkey';
import { KeyService } from './KeyService';

function escapeValue(str: string): string {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');
}

function q(str: string): string {
  return `"${escapeValue(str)}"`;
}

export function serializeKeyAsCommands(
  key: string,
  type: string,
  value: unknown,
  ttl: number
): string {
  let cmd = '';
  const qk = q(key);

  switch (type) {
    case 'string':
      cmd = `SET ${qk} ${q(value as string)}\n`;
      break;

    case 'hash': {
      const fields = value as Array<{ field: string; value: string }>;
      const pairs = fields.map(f => `${q(f.field)} ${q(f.value)}`).join(' ');
      cmd = `HSET ${qk} ${pairs}\n`;
      break;
    }

    case 'list': {
      const elements = value as string[];
      cmd = `RPUSH ${qk} ${elements.map(q).join(' ')}\n`;
      break;
    }

    case 'set': {
      const members = value as string[];
      cmd = `SADD ${qk} ${members.map(q).join(' ')}\n`;
      break;
    }

    case 'zset': {
      const members = value as Array<{ score: number; member: string }>;
      const args = members.map(m => `${m.score} ${q(m.member)}`).join(' ');
      cmd = `ZADD ${qk} ${args}\n`;
      break;
    }

    case 'stream': {
      const entries = value as Array<{ id: string; fields: Record<string, string> }>;
      for (const entry of entries) {
        const fieldArgs = Object.entries(entry.fields).map(([f, v]) => `${q(f)} ${q(v)}`).join(' ');
        cmd += `XADD ${qk} ${entry.id} ${fieldArgs}\n`;
      }
      break;
    }

    case 'json':
      cmd = `JSON.SET ${qk} $ ${q(value as string)}\n`;
      break;
  }

  if (ttl > 0) {
    cmd += `EXPIRE ${qk} ${ttl}\n`;
  }

  return cmd;
}

export interface ExportOptions {
  keys: string[];
  pattern: string;
  format: 'text' | 'binary';
  filePath: string;
  onProgress?: (exported: number, total: number) => void;
  cancellationToken?: { isCancellationRequested: boolean };
}

export async function exportKeys(
  client: Valkey,
  options: ExportOptions
): Promise<{ exported: number }> {
  const keyService = new KeyService(client);
  const keys = options.keys;
  const total = keys.length;
  let exported = 0;

  const stream = fs.createWriteStream(options.filePath, { encoding: 'utf-8' });
  const streamError = new Promise<never>((_, reject) => {
    stream.on('error', reject);
  });

  try {
    if (options.format === 'text') {
      stream.write(`# BetterDB Export | ${options.pattern} | ${new Date().toISOString()} | ${total} keys\n`);

      for (let i = 0; i < total; i++) {
        if (options.cancellationToken?.isCancellationRequested) break;

        const key = keys[i];
        const keyValue = await keyService.getValue(key);
        if (!keyValue) continue;

        const valueData = extractValueForSerialization(keyValue);
        const commands = serializeKeyAsCommands(key, keyValue.type, valueData, keyValue.ttl);
        stream.write(commands);
        exported++;

        options.onProgress?.(i + 1, total);
      }
    } else {
      const header = JSON.stringify({
        _header: {
          version: 1,
          source: 'betterdb',
          date: new Date().toISOString(),
          pattern: options.pattern,
          count: total,
        },
      });
      stream.write(header + '\n');

      for (let i = 0; i < total; i++) {
        if (options.cancellationToken?.isCancellationRequested) break;

        const key = keys[i];
        const [ttl, dump] = await Promise.all([
          client.ttl(key),
          client.dump(key),
        ]);

        if (!dump) continue;

        const line = JSON.stringify({
          key,
          ttl: ttl > 0 ? ttl : 0,
          dump: (dump as Buffer).toString('base64'),
        });
        stream.write(line + '\n');
        exported++;

        options.onProgress?.(i + 1, total);
      }
    }
  } finally {
    await Promise.race([
      new Promise<void>((resolve) => stream.end(() => resolve())),
      streamError,
    ]).catch(() => {});
  }

  return { exported };
}

function extractValueForSerialization(keyValue: { type: string; value: { type: string } & Record<string, unknown> }): unknown {
  switch (keyValue.type) {
    case 'string': return (keyValue.value as { value: string }).value;
    case 'hash': return (keyValue.value as { fields: unknown }).fields;
    case 'list': return (keyValue.value as { elements: unknown }).elements;
    case 'set': return (keyValue.value as { members: unknown }).members;
    case 'zset': return (keyValue.value as { members: unknown }).members;
    case 'stream': return (keyValue.value as { entries: unknown }).entries;
    case 'json': return (keyValue.value as { value: string }).value;
    default: return '';
  }
}

