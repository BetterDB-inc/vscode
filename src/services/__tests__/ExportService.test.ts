import { describe, it, expect, vi } from 'vitest';

vi.mock('vscode', () => ({
  window: {
    createOutputChannel: () => ({ appendLine: vi.fn(), show: vi.fn() }),
  },
  workspace: { getConfiguration: () => ({ get: vi.fn() }) },
  EventEmitter: class {},
}));

import { serializeKeyAsCommands } from '../ExportService';

describe('serializeKeyAsCommands', () => {
  it('serializes a string key', () => {
    const result = serializeKeyAsCommands('mykey', 'string', 'hello world', -1);
    expect(result).toBe('SET "mykey" "hello world"\n');
  });

  it('serializes a string key with TTL', () => {
    const result = serializeKeyAsCommands('mykey', 'string', 'hello', 3600);
    expect(result).toBe('SET "mykey" "hello"\nEXPIRE "mykey" 3600\n');
  });

  it('escapes quotes and newlines in string values', () => {
    const result = serializeKeyAsCommands('k', 'string', 'say "hi"\nnewline', -1);
    expect(result).toBe('SET "k" "say \\"hi\\"\\nnewline"\n');
  });

  it('escapes quotes in key names', () => {
    const result = serializeKeyAsCommands('my "key"', 'string', 'val', -1);
    expect(result).toBe('SET "my \\"key\\"" "val"\n');
  });

  it('serializes a hash key', () => {
    const fields = [{ field: 'name', value: 'Alice' }, { field: 'age', value: '30' }];
    const result = serializeKeyAsCommands('user:1', 'hash', fields, -1);
    expect(result).toBe('HSET "user:1" "name" "Alice" "age" "30"\n');
  });

  it('serializes a list key', () => {
    const elements = ['a', 'b', 'c'];
    const result = serializeKeyAsCommands('mylist', 'list', elements, -1);
    expect(result).toBe('RPUSH "mylist" "a" "b" "c"\n');
  });

  it('serializes a set key', () => {
    const members = ['x', 'y'];
    const result = serializeKeyAsCommands('myset', 'set', members, -1);
    expect(result).toBe('SADD "myset" "x" "y"\n');
  });

  it('serializes a sorted set key', () => {
    const members = [{ score: 1.5, member: 'alice' }, { score: 2.0, member: 'bob' }];
    const result = serializeKeyAsCommands('scores', 'zset', members, -1);
    expect(result).toBe('ZADD "scores" 1.5 "alice" 2 "bob"\n');
  });

  it('serializes a stream key', () => {
    const entries = [{ id: '1234567890-0', fields: { field1: 'val1' } }];
    const result = serializeKeyAsCommands('mystream', 'stream', entries, 600);
    expect(result).toBe('XADD "mystream" 1234567890-0 "field1" "val1"\nEXPIRE "mystream" 600\n');
  });

  it('serializes a json key', () => {
    const result = serializeKeyAsCommands('doc', 'json', '{"name":"Bob"}', -1);
    expect(result).toBe('JSON.SET "doc" $ "{\\"name\\":\\"Bob\\"}"\n');
  });
});
