import { describe, it, expect } from 'vitest';
import { formatShellCommand } from './formatShellCommand';

describe('formatShellCommand', () => {
  const conn = { host: '127.0.0.1', port: 6383 };

  it('emits a runnable shell pipeline for a KNN query', () => {
    const cmd = formatShellCommand({
      connection: conn,
      indexName: 'idx:products_vec_flat',
      queryString: '(@category:{Electronics})=>[KNN 10 @embedding $vec AS score]',
      vectorBase64: 'AAAAAA==',
    });
    expect(cmd).toContain("printf '%s' 'AAAAAA==' | base64 -d");
    expect(cmd).toContain('valkey-cli -h 127.0.0.1 -p 6383 -x');
    expect(cmd).toContain("FT.SEARCH 'idx:products_vec_flat'");
    expect(cmd).toContain("DIALECT 2 PARAMS 2 vec");
  });

  it('single-quote-escapes queries that contain single quotes', () => {
    const cmd = formatShellCommand({
      connection: conn,
      indexName: 'idx',
      queryString: "(@name:{O'Brien})=>[KNN 5 @v $vec]",
      vectorBase64: 'AA==',
    });
    expect(cmd).toContain("'(@name:{O'\\''Brien})=>[KNN 5 @v $vec]'");
  });

  it('wraps IPv6 host cleanly', () => {
    const cmd = formatShellCommand({
      connection: { host: '::1', port: 6380 },
      indexName: 'idx',
      queryString: '*=>[KNN 1 @v $vec]',
      vectorBase64: 'AA==',
    });
    expect(cmd).toContain('valkey-cli -h ::1 -p 6380');
  });

  it('supports a filter-empty pure KNN query', () => {
    const cmd = formatShellCommand({
      connection: conn,
      indexName: 'idx',
      queryString: '*=>[KNN 10 @v $vec]',
      vectorBase64: 'AA==',
    });
    expect(cmd).toContain("'*=>[KNN 10 @v $vec]'");
  });
});
