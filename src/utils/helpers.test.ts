import { describe, it, expect } from 'vitest';
import { generateId, arrayToObject, parseRedisInfo, formatBytes, escapeHtml } from './helpers';

describe('generateId', () => {
  it('generates a string starting with "conn-"', () => {
    const id = generateId();
    expect(id.startsWith('conn-')).toBe(true);
  });

  it('generates unique IDs', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      ids.add(generateId());
    }
    expect(ids.size).toBe(100);
  });

  it('includes timestamp and random suffix', () => {
    const id = generateId();
    const parts = id.split('-');
    expect(parts.length).toBe(3);
    expect(parts[0]).toBe('conn');
    expect(Number(parts[1])).toBeGreaterThan(0);
    expect(parts[2].length).toBe(7);
  });
});

describe('arrayToObject', () => {
  it('converts empty array to empty object', () => {
    expect(arrayToObject([])).toEqual({});
  });

  it('converts key-value pairs to object', () => {
    expect(arrayToObject(['key1', 'value1', 'key2', 'value2'])).toEqual({
      key1: 'value1',
      key2: 'value2',
    });
  });

  it('handles single key-value pair', () => {
    expect(arrayToObject(['name', 'test'])).toEqual({ name: 'test' });
  });

  it('overwrites duplicate keys with later values', () => {
    expect(arrayToObject(['key', 'first', 'key', 'second'])).toEqual({ key: 'second' });
  });
});

describe('parseRedisInfo', () => {
  it('parses empty string to empty object', () => {
    expect(parseRedisInfo('')).toEqual({});
  });

  it('ignores comment lines starting with #', () => {
    const info = '# Server\r\nredis_version:7.0.0\r\n# Clients\r\nconnected_clients:1';
    expect(parseRedisInfo(info)).toEqual({
      redis_version: '7.0.0',
      connected_clients: '1',
    });
  });

  it('handles values containing colons', () => {
    const info = 'executable:/usr/bin/redis-server\r\nconfig_file:/etc/redis.conf';
    expect(parseRedisInfo(info)).toEqual({
      executable: '/usr/bin/redis-server',
      config_file: '/etc/redis.conf',
    });
  });

  it('ignores lines without colons', () => {
    const info = 'redis_version:7.0.0\r\ninvalid line\r\nused_memory:1024';
    expect(parseRedisInfo(info)).toEqual({
      redis_version: '7.0.0',
      used_memory: '1024',
    });
  });
});

describe('formatBytes', () => {
  it('formats zero bytes', () => {
    expect(formatBytes(0)).toBe('0 B');
  });

  it('formats bytes under 1KB', () => {
    expect(formatBytes(1)).toBe('1 B');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1023)).toBe('1023 B');
  });

  it('formats kilobytes', () => {
    expect(formatBytes(1024)).toBe('1 KB');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(10240)).toBe('10 KB');
  });

  it('formats megabytes', () => {
    expect(formatBytes(1048576)).toBe('1 MB');
    expect(formatBytes(1572864)).toBe('1.5 MB');
    expect(formatBytes(10485760)).toBe('10 MB');
  });

  it('formats gigabytes', () => {
    expect(formatBytes(1073741824)).toBe('1 GB');
    expect(formatBytes(1610612736)).toBe('1.5 GB');
  });
});

describe('escapeHtml', () => {
  it('returns empty string for empty input', () => {
    expect(escapeHtml('')).toBe('');
  });

  it('escapes ampersand', () => {
    expect(escapeHtml('foo & bar')).toBe('foo &amp; bar');
  });

  it('escapes less than', () => {
    expect(escapeHtml('<script>')).toBe('&lt;script&gt;');
  });

  it('escapes greater than', () => {
    expect(escapeHtml('a > b')).toBe('a &gt; b');
  });

  it('escapes double quotes', () => {
    expect(escapeHtml('say "hello"')).toBe('say &quot;hello&quot;');
  });

  it('escapes single quotes', () => {
    expect(escapeHtml("it's")).toBe('it&#039;s');
  });

  it('escapes all special characters together', () => {
    expect(escapeHtml('<a href="test">\'&\'</a>')).toBe(
      '&lt;a href=&quot;test&quot;&gt;&#039;&amp;&#039;&lt;/a&gt;'
    );
  });

  it('leaves plain text unchanged', () => {
    expect(escapeHtml('Hello World 123')).toBe('Hello World 123');
  });
});
