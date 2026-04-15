import * as fs from 'fs';
import * as readline from 'readline';
import Valkey from 'iovalkey';
import { bindValkeyCall } from './valkeyCall';

export function unescapeValue(str: string): string {
  return str.replace(/\\(\\|n|r|t|")/g, (_, ch) => {
    switch (ch) {
      case '\\': return '\\';
      case 'n':  return '\n';
      case 'r':  return '\r';
      case 't':  return '\t';
      case '"':  return '"';
      default:   return ch;
    }
  });
}

export function parseCommand(line: string): { command: string; args: string[] } | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return null;

  const tokens: string[] = [];
  let i = 0;

  while (i < trimmed.length) {
    if (trimmed[i] === ' ') {
      i++;
      continue;
    }

    if (trimmed[i] === '"') {
      i++;
      let value = '';
      while (i < trimmed.length) {
        if (trimmed[i] === '\\' && i + 1 < trimmed.length) {
          value += trimmed[i] + trimmed[i + 1];
          i += 2;
        } else if (trimmed[i] === '"') {
          i++;
          break;
        } else {
          value += trimmed[i];
          i++;
        }
      }
      tokens.push(unescapeValue(value));
    } else {
      let value = '';
      while (i < trimmed.length && trimmed[i] !== ' ') {
        value += trimmed[i];
        i++;
      }
      tokens.push(value);
    }
  }

  if (tokens.length === 0) return null;

  const command = tokens[0].toUpperCase();
  return { command, args: tokens.slice(1) };
}

const ALLOWED_IMPORT_COMMANDS: ReadonlySet<string> = new Set([
  'SET', 'HSET', 'RPUSH', 'SADD', 'ZADD', 'XADD', 'EXPIRE', 'JSON.SET',
]);

export type ConflictStrategy = 'skip' | 'overwrite' | 'abort';

export interface ImportOptions {
  filePath: string;
  conflictStrategy: ConflictStrategy;
  onProgress?: (imported: number, total: number) => void;
  cancellationToken?: { isCancellationRequested: boolean };
}

export interface ImportResult {
  imported: number;
  skipped: number;
  failed: number;
  errors: string[];
}

export async function importKeys(
  client: Valkey,
  options: ImportOptions
): Promise<ImportResult> {
  const ext = options.filePath.toLowerCase();
  if (ext.endsWith('.rdb')) {
    return importBinary(client, options);
  }
  return importText(client, options);
}

async function importText(
  client: Valkey,
  options: ImportOptions
): Promise<ImportResult> {
  const result: ImportResult = { imported: 0, skipped: 0, failed: 0, errors: [] };
  const rl = readline.createInterface({
    input: fs.createReadStream(options.filePath, { encoding: 'utf-8' }),
    crlfDelay: Infinity,
  });

  const call = bindValkeyCall(client);
  const keyState = new Map<string, 'imported' | 'skipped' | 'failed'>();
  let total = 0;
  let aborted = false;

  for await (const line of rl) {
    if (options.cancellationToken?.isCancellationRequested) break;
    if (aborted) break;

    const parsed = parseCommand(line);
    if (!parsed) {
      if (total === 0) {
        const headerMatch = line.match(/\| (\d+) keys$/);
        if (headerMatch) {
          total = parseInt(headerMatch[1], 10);
        }
      }
      continue;
    }

    const { command, args } = parsed;
    const key = args[0];

    if (!ALLOWED_IMPORT_COMMANDS.has(command)) {
      result.errors.push(`Disallowed command "${command}" skipped for safety`);
      continue;
    }

    if (command === 'EXPIRE' && args.length === 2) {
      if (keyState.get(key) !== 'imported') continue;
      try {
        await call('EXPIRE', args[0], args[1]);
      } catch (err) {
        result.errors.push(`EXPIRE ${key}: ${err instanceof Error ? err.message : String(err)}`);
      }
      options.onProgress?.(result.imported + result.skipped + result.failed, total);
      continue;
    }

    const existingState = keyState.get(key);

    if (existingState === 'skipped' || existingState === 'failed') {
      continue;
    }

    if (existingState === 'imported') {
      try {
        await call(command, ...args);
      } catch (err) {
        result.errors.push(`${command} ${key}: ${err instanceof Error ? err.message : String(err)}`);
      }
      options.onProgress?.(result.imported + result.skipped + result.failed, total);
      continue;
    }

    let keyExists = false;
    try {
      keyExists = (await client.exists(key)) === 1;
    } catch {
      // treat as non-existing
    }

    if (keyExists) {
      if (options.conflictStrategy === 'abort') {
        result.errors.push(`Key "${key}" already exists — import aborted`);
        aborted = true;
        break;
      }
      if (options.conflictStrategy === 'skip') {
        keyState.set(key, 'skipped');
        result.skipped++;
        options.onProgress?.(result.imported + result.skipped + result.failed, total);
        continue;
      }
      try {
        await client.del(key);
      } catch (err) {
        keyState.set(key, 'failed');
        result.failed++;
        result.errors.push(`DEL ${key}: ${err instanceof Error ? err.message : String(err)}`);
        options.onProgress?.(result.imported + result.skipped + result.failed, total);
        continue;
      }
    }

    try {
      await call(command, ...args);
      keyState.set(key, 'imported');
      result.imported++;
    } catch (err) {
      keyState.set(key, 'failed');
      result.failed++;
      result.errors.push(`${command} ${key}: ${err instanceof Error ? err.message : String(err)}`);
    }

    options.onProgress?.(result.imported + result.skipped + result.failed, total);
  }

  return result;
}

async function importBinary(
  client: Valkey,
  options: ImportOptions
): Promise<ImportResult> {
  const result: ImportResult = { imported: 0, skipped: 0, failed: 0, errors: [] };
  const rl = readline.createInterface({
    input: fs.createReadStream(options.filePath, { encoding: 'utf-8' }),
    crlfDelay: Infinity,
  });

  let total = 0;
  let isFirstLine = true;

  for await (const line of rl) {
    if (options.cancellationToken?.isCancellationRequested) break;

    const trimmed = line.trim();
    if (!trimmed) continue;

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      result.failed++;
      result.errors.push(`Invalid JSON line: ${trimmed.slice(0, 50)}...`);
      isFirstLine = false;
      continue;
    }

    // Parse header
    if (isFirstLine && parsed._header) {
      const header = parsed._header as { count?: number | string };
      const parsedTotal = parseInt(String(header.count ?? ''), 10);
      total = Number.isFinite(parsedTotal) ? parsedTotal : 0;
      isFirstLine = false;
      continue;
    }
    isFirstLine = false;

    const key = parsed.key as string;
    const ttl = parsed.ttl as number;
    const dumpBase64 = parsed.dump as string;

    if (!key || !dumpBase64) {
      result.failed++;
      result.errors.push(`Invalid entry: missing key or dump data`);
      continue;
    }

    // Check conflict
    if (options.conflictStrategy !== 'overwrite') {
      let exists: number;
      try {
        exists = await client.exists(key);
      } catch (err) {
        result.failed++;
        result.errors.push(`EXISTS ${key}: ${err instanceof Error ? err.message : String(err)}`);
        options.onProgress?.(result.imported + result.skipped + result.failed, total);
        continue;
      }
      if (exists) {
        if (options.conflictStrategy === 'abort') {
          result.errors.push(`Key "${key}" already exists — import aborted`);
          break;
        }
        result.skipped++;
        options.onProgress?.(result.imported + result.skipped + result.failed, total);
        continue;
      }
    }

    try {
      const dumpBuffer = Buffer.from(dumpBase64, 'base64');
      const ttlMs = ttl > 0 ? ttl * 1000 : 0;
      if (options.conflictStrategy === 'overwrite') {
        await client.restore(key, ttlMs, dumpBuffer, 'REPLACE');
      } else {
        await client.restore(key, ttlMs, dumpBuffer);
      }
      result.imported++;
    } catch (err) {
      result.failed++;
      result.errors.push(`RESTORE ${key}: ${err instanceof Error ? err.message : String(err)}`);
    }

    options.onProgress?.(result.imported + result.skipped + result.failed, total);
  }

  return result;
}
