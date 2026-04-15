import { describe, it, expect } from 'vitest';
import { parseCommand, unescapeValue } from '../ImportService';

describe('unescapeValue', () => {
  it('unescapes quotes', () => {
    expect(unescapeValue('say \\"hi\\"')).toBe('say "hi"');
  });

  it('unescapes newlines', () => {
    expect(unescapeValue('line1\\nline2')).toBe('line1\nline2');
  });

  it('unescapes backslashes', () => {
    expect(unescapeValue('path\\\\to\\\\file')).toBe('path\\to\\file');
  });

  it('unescapes tabs and carriage returns', () => {
    expect(unescapeValue('a\\tb\\rc')).toBe('a\tb\rc');
  });
});

describe('parseCommand', () => {
  it('parses SET command', () => {
    const result = parseCommand('SET "mykey" "hello world"');
    expect(result).toEqual({ command: 'SET', args: ['mykey', 'hello world'] });
  });

  it('parses SET with escaped quotes', () => {
    const result = parseCommand('SET "k" "say \\"hi\\""');
    expect(result).toEqual({ command: 'SET', args: ['k', 'say "hi"'] });
  });

  it('parses HSET command with multiple fields', () => {
    const result = parseCommand('HSET "user:1" "name" "Alice" "age" "30"');
    expect(result).toEqual({ command: 'HSET', args: ['user:1', 'name', 'Alice', 'age', '30'] });
  });

  it('parses RPUSH command', () => {
    const result = parseCommand('RPUSH "mylist" "a" "b" "c"');
    expect(result).toEqual({ command: 'RPUSH', args: ['mylist', 'a', 'b', 'c'] });
  });

  it('parses SADD command', () => {
    const result = parseCommand('SADD "myset" "x" "y"');
    expect(result).toEqual({ command: 'SADD', args: ['myset', 'x', 'y'] });
  });

  it('parses ZADD command', () => {
    const result = parseCommand('ZADD "scores" 1.5 "alice" 2 "bob"');
    expect(result).toEqual({ command: 'ZADD', args: ['scores', '1.5', 'alice', '2', 'bob'] });
  });

  it('parses XADD command', () => {
    const result = parseCommand('XADD "mystream" 1234567890-0 "field1" "val1"');
    expect(result).toEqual({ command: 'XADD', args: ['mystream', '1234567890-0', 'field1', 'val1'] });
  });

  it('parses EXPIRE command', () => {
    const result = parseCommand('EXPIRE "mykey" 3600');
    expect(result).toEqual({ command: 'EXPIRE', args: ['mykey', '3600'] });
  });

  it('parses JSON.SET command', () => {
    const result = parseCommand('JSON.SET "doc" $ "{\\"name\\":\\"Bob\\"}"');
    expect(result).toEqual({ command: 'JSON.SET', args: ['doc', '$', '{"name":"Bob"}'] });
  });

  it('returns null for comment lines', () => {
    expect(parseCommand('# This is a comment')).toBeNull();
  });

  it('returns null for empty lines', () => {
    expect(parseCommand('')).toBeNull();
    expect(parseCommand('   ')).toBeNull();
  });
});
