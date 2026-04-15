import * as fs from 'fs';
import Valkey from 'iovalkey';
import { KeyService } from './KeyService';
import { KeyValue } from '../models/key.model';

const COUNT_WIDTH = 10;
const MAX_COUNT = 10 ** COUNT_WIDTH - 1;
const padCount = (n: number): string => {
  if (n > MAX_COUNT) {
    throw new Error(`Export count ${n} exceeds maximum ${MAX_COUNT}`);
  }
  return String(n).padStart(COUNT_WIDTH, '0');
};

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

function formatZsetScore(score: number): string {
  if (score === Infinity) return '+inf';
  if (score === -Infinity) return '-inf';
  return String(score);
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
      if (fields.length === 0) return '';
      const pairs = fields.map(f => `${q(f.field)} ${q(f.value)}`).join(' ');
      cmd = `HSET ${qk} ${pairs}\n`;
      break;
    }

    case 'list': {
      const elements = value as string[];
      if (elements.length === 0) return '';
      cmd = `RPUSH ${qk} ${elements.map(q).join(' ')}\n`;
      break;
    }

    case 'set': {
      const members = value as string[];
      if (members.length === 0) return '';
      cmd = `SADD ${qk} ${members.map(q).join(' ')}\n`;
      break;
    }

    case 'zset': {
      const members = value as Array<{ score: number; member: string }>;
      if (members.length === 0) return '';
      const args = members.map(m => `${formatZsetScore(m.score)} ${q(m.member)}`).join(' ');
      cmd = `ZADD ${qk} ${args}\n`;
      break;
    }

    case 'stream': {
      const entries = value as Array<{ id: string; fields: Record<string, string> }>;
      if (entries.length === 0) return '';
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
  onProgress?: (processed: number, total: number) => void;
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
  let streamErr: Error | null = null;
  stream.on('error', (err) => {
    streamErr = err;
  });

  const exportDate = new Date().toISOString();
  const makeTextHeader = (count: number) =>
    `# BetterDB Export | ${options.pattern} | ${exportDate} | ${padCount(count)} keys\n`;
  const makeBinaryHeader = (count: number) =>
    JSON.stringify({
      _header: {
        version: 1,
        source: 'betterdb',
        date: exportDate,
        pattern: options.pattern,
        count: padCount(count),
      },
    }) + '\n';

  try {
    if (options.format === 'text') {
      stream.write(makeTextHeader(total));

      // TODO: extend text-format support to module-backed key types.
      // Currently only the 7 core types plus RedisJSON are serialized as
      // commands. Unknown types (RedisBloom filters: MBbloom--/MBbloomCF,
      // Count-Min Sketch, Top-K, t-digest; RedisTimeSeries: TSDB-TYPE;
      // Valkey 8+ vector sets: vectorset; legacy RedisGraph: graphdata)
      // are skipped here. Use the binary (RDB) format to round-trip them
      // via DUMP/RESTORE — that path works for any server-side type.
      for (let i = 0; i < total; i++) {
        if (options.cancellationToken?.isCancellationRequested) break;
        if (streamErr) break;

        const key = keys[i];
        const keyValue = await keyService.getCompleteValue(key);
        if (!keyValue) {
          options.onProgress?.(i + 1, total);
          continue;
        }

        if (keyValue.type === 'unknown') {
          console.warn(`[BetterDB export] Skipping key "${key}": unsupported type for plain-text export. Use binary (RDB) format instead.`);
          options.onProgress?.(i + 1, total);
          continue;
        }

        const valueData = extractValueForSerialization(keyValue);
        const commands = serializeKeyAsCommands(key, keyValue.type, valueData, keyValue.ttl);
        if (commands.length === 0) {
          options.onProgress?.(i + 1, total);
          continue;
        }
        stream.write(commands);
        exported++;

        options.onProgress?.(i + 1, total);
      }
    } else {
      stream.write(makeBinaryHeader(total));

      for (let i = 0; i < total; i++) {
        if (options.cancellationToken?.isCancellationRequested) break;
        if (streamErr) break;

        const key = keys[i];
        const [ttl, dump] = await Promise.all([
          client.ttl(key),
          client.dumpBuffer(key),
        ]);

        if (!dump) {
          options.onProgress?.(i + 1, total);
          continue;
        }

        const line = JSON.stringify({
          key,
          ttl: ttl > 0 ? ttl : 0,
          dump: dump.toString('base64'),
        });
        stream.write(line + '\n');
        exported++;

        options.onProgress?.(i + 1, total);
      }
    }
  } finally {
    await new Promise<void>((resolve, reject) => {
      stream.end((err?: Error | null) => {
        if (err) reject(err);
        else if (streamErr) reject(streamErr);
        else resolve();
      });
    });
  }

  if (exported !== total) {
    const finalHeader = options.format === 'text'
      ? makeTextHeader(exported)
      : makeBinaryHeader(exported);
    const fh = await fs.promises.open(options.filePath, 'r+');
    try {
      const buf = Buffer.from(finalHeader, 'utf-8');
      await fh.write(buf, 0, buf.length, 0);
    } finally {
      await fh.close();
    }
  }

  return { exported };
}

function extractValueForSerialization(keyValue: KeyValue): unknown {
  const v = keyValue.value;
  switch (v.type) {
    case 'string': return v.value;
    case 'hash': return v.fields;
    case 'list': return v.elements;
    case 'set': return v.members;
    case 'zset': return v.members;
    case 'stream': return v.entries;
    case 'json': return v.value;
    default: return '';
  }
}

