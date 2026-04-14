import { describe, it, expect, vi } from 'vitest';
import {
  parseSearchResponse,
  deduplicateHistory,
  findCommand,
  executeSearchQuery,
} from '../SearchQueryService';
import type { QueryExecuteOptions } from '../SearchQueryService';

vi.mock('iovalkey', () => ({}));

describe('parseSearchResponse', () => {
  it('parses a full response with two results', () => {
    const raw = [2, 'user:1', ['name', 'Alice', 'age', '30'], 'user:2', ['name', 'Bob', 'age', '25']];
    const results = parseSearchResponse(raw as unknown[]);
    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({ key: 'user:1', fields: { name: 'Alice', age: '30' } });
    expect(results[1]).toEqual({ key: 'user:2', fields: { name: 'Bob', age: '25' } });
  });

  it('returns empty array for [0]', () => {
    const results = parseSearchResponse([0]);
    expect(results).toEqual([]);
  });

  it('handles odd-length response (key without field array) as empty fields', () => {
    const raw = [1, 'user:1'];
    const results = parseSearchResponse(raw as unknown[]);
    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({ key: 'user:1', fields: {} });
  });

  it('handles non-array field entry as empty fields', () => {
    const raw = [1, 'user:1', 'not-an-array'];
    const results = parseSearchResponse(raw as unknown[]);
    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({ key: 'user:1', fields: {} });
  });
});

describe('deduplicateHistory', () => {
  it('prepends new query to empty history', () => {
    const result = deduplicateHistory([], 'FT.SEARCH idx *', 10);
    expect(result).toEqual(['FT.SEARCH idx *']);
  });

  it('prepends new query to existing history', () => {
    const result = deduplicateHistory(['FT.SEARCH idx @name:Alice'], 'FT.SEARCH idx *', 10);
    expect(result).toEqual(['FT.SEARCH idx *', 'FT.SEARCH idx @name:Alice']);
  });

  it('moves duplicate query to front without duplicating', () => {
    const existing = ['FT.SEARCH idx @name:Alice', 'FT.SEARCH idx *', 'FT.SEARCH idx @age:[20 30]'];
    const result = deduplicateHistory(existing, 'FT.SEARCH idx *', 10);
    expect(result).toEqual(['FT.SEARCH idx *', 'FT.SEARCH idx @name:Alice', 'FT.SEARCH idx @age:[20 30]']);
  });

  it('trims history to maxSize', () => {
    const existing = ['q1', 'q2', 'q3'];
    const result = deduplicateHistory(existing, 'q0', 3);
    expect(result).toHaveLength(3);
    expect(result[0]).toBe('q0');
    expect(result).not.toContain('q3');
  });

  it('does not mutate the original array', () => {
    const existing = ['q1', 'q2'];
    const copy = [...existing];
    deduplicateHistory(existing, 'q0', 10);
    expect(existing).toEqual(copy);
  });
});

describe('findCommand', () => {
  it('finds FT.SEARCH by exact uppercase name', () => {
    const cmd = findCommand('FT.SEARCH');
    expect(cmd).toBeDefined();
    expect(cmd?.prefix).toBe('FT.SEARCH');
  });

  it('finds FT.SEARCH by lowercase name (case-insensitive)', () => {
    const cmd = findCommand('ft.search');
    expect(cmd).toBeDefined();
    expect(cmd?.prefix).toBe('FT.SEARCH');
  });

  it('returns undefined for FT.AGGREGATE (not registered)', () => {
    expect(findCommand('FT.AGGREGATE')).toBeUndefined();
  });

  it('returns undefined for empty string', () => {
    expect(findCommand('')).toBeUndefined();
  });
});

describe('executeSearchQuery', () => {
  it('returns error result for unknown command', async () => {
    const mockClient = {} as never;
    const options: QueryExecuteOptions = { command: 'FT.AGGREGATE', index: 'myIdx', query: '*' };
    const result = await executeSearchQuery(mockClient, options);
    expect(result.error).toMatch(/Unknown command/);
    expect(result.results).toEqual([]);
    expect(result.total).toBe(0);
    expect(result.tookMs).toBe(0);
  });

  it('returns parsed results on success', async () => {
    const mockClient = {
      call: vi.fn().mockResolvedValue([2, 'user:1', ['name', 'Alice'], 'user:2', ['name', 'Bob']]),
    } as never;
    const options: QueryExecuteOptions = { command: 'FT.SEARCH', index: 'myIdx', query: '*' };
    const result = await executeSearchQuery(mockClient, options);
    expect(result.error).toBeUndefined();
    expect(result.total).toBe(2);
    expect(result.results).toHaveLength(2);
    expect(result.tookMs).toBeGreaterThanOrEqual(0);
  });

  it('returns error result when client.call throws', async () => {
    const mockClient = {
      call: vi.fn().mockRejectedValue(new Error('connection refused')),
    } as never;
    const options: QueryExecuteOptions = { command: 'FT.SEARCH', index: 'myIdx', query: '*' };
    const result = await executeSearchQuery(mockClient, options);
    expect(result.error).toBe('connection refused');
    expect(result.results).toEqual([]);
    expect(result.total).toBe(0);
  });
});
