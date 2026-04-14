import Valkey from 'iovalkey';
import { SearchResult } from '../shared/types';

export type { SearchResult };

export interface QueryExecuteOptions {
  command: string;
  index: string;
  query: string;
}

export interface QueryExecuteResult {
  results: SearchResult[];
  total: number;
  tookMs: number;
  error?: string;
}

interface QueryCommand {
  prefix: string;
  execute: (client: Valkey, index: string, queryArgs: string[]) => Promise<unknown[]>;
  parseResponse: (raw: unknown[]) => SearchResult[];
}

export function parseSearchResponse(raw: unknown[]): SearchResult[] {
  if (raw.length === 0) {
    return [];
  }

  const results: SearchResult[] = [];
  let i = 1;

  while (i < raw.length) {
    const key = raw[i] as string;
    const fieldEntry = raw[i + 1];
    const fields: Record<string, string> = {};

    if (Array.isArray(fieldEntry)) {
      for (let j = 0; j + 1 < fieldEntry.length; j += 2) {
        fields[fieldEntry[j] as string] = fieldEntry[j + 1] as string;
      }
    }

    results.push({ key, fields });
    i += 2;
  }

  return results;
}

const commandRegistry: QueryCommand[] = [
  {
    prefix: 'FT.SEARCH',
    execute: (client: Valkey, index: string, queryArgs: string[]) =>
      client.call('FT.SEARCH', index, ...queryArgs) as Promise<unknown[]>,
    parseResponse: parseSearchResponse,
  },
];

export function findCommand(commandStr: string): QueryCommand | undefined {
  if (!commandStr) {
    return undefined;
  }
  return commandRegistry.find(
    (cmd) => cmd.prefix.toLowerCase() === commandStr.toLowerCase()
  );
}

export function deduplicateHistory(existing: string[], newQuery: string, maxSize: number): string[] {
  const filtered = existing.filter((q) => q !== newQuery);
  return [newQuery, ...filtered].slice(0, maxSize);
}

export async function executeSearchQuery(
  client: Valkey,
  options: QueryExecuteOptions
): Promise<QueryExecuteResult> {
  const command = findCommand(options.command);

  if (!command) {
    return { results: [], total: 0, tookMs: 0, error: `Unknown command: ${options.command}` };
  }

  const queryArgs = options.query.split(/\s+/).filter((s) => s.length > 0);
  const start = Date.now();

  try {
    const raw = await command.execute(client, options.index, queryArgs);
    const tookMs = Date.now() - start;
    const results = command.parseResponse(raw);
    const total = typeof raw[0] === 'number' ? raw[0] : parseInt(raw[0] as string, 10) || 0;
    return { results, total, tookMs };
  } catch (err) {
    const tookMs = Date.now() - start;
    return {
      results: [],
      total: 0,
      tookMs,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
