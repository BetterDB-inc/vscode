import { describe, it, expect, vi } from 'vitest';

vi.mock('vscode', () => ({}));

import { SearchQueryService } from '../SearchQueryService';

const ftInfoResponse = [
  'index_name', 'idx:users',
  'attributes', [
    [ 'identifier', 'name', 'attribute', 'name', 'type', 'TEXT' ],
    [ 'identifier', 'city', 'attribute', 'city', 'type', 'TAG' ],
    [ 'identifier', 'age',  'attribute', 'age',  'type', 'NUMERIC' ],
    [ 'identifier', 'loc',  'attribute', 'loc',  'type', 'GEO' ],
  ],
];

describe('SearchQueryService.fetchIndexSchema', () => {
  it('parses FT.INFO into typed field list', async () => {
    const client = { call: vi.fn().mockResolvedValue(ftInfoResponse) };
    const svc = new SearchQueryService();
    const fields = await svc.fetchIndexSchema(client, 'idx:users');
    expect(fields).toEqual([
      { name: 'name', type: 'TEXT', attribute: 'name' },
      { name: 'city', type: 'TAG', attribute: 'city' },
      { name: 'age',  type: 'NUMERIC', attribute: 'age' },
      { name: 'loc',  type: 'GEO', attribute: 'loc' },
    ]);
    expect(client.call).toHaveBeenCalledWith('FT.INFO', 'idx:users');
  });
});

describe('SearchQueryService.fetchTagValues', () => {
  it('returns values from FT.TAGVALS call', async () => {
    const client = { call: vi.fn().mockResolvedValue(['Portland', 'Seattle', 'portland']) };
    const svc = new SearchQueryService();
    const vals = await svc.fetchTagValues(client, 'idx:users', 'city');
    expect(vals).toEqual(['Portland', 'Seattle', 'portland']);
    expect(client.call).toHaveBeenCalledWith('FT.TAGVALS', 'idx:users', 'city');
  });

  it('coerces Buffer values to strings', async () => {
    const client = { call: vi.fn().mockResolvedValue([Buffer.from('Portland'), Buffer.from('Seattle')]) };
    const svc = new SearchQueryService();
    const vals = await svc.fetchTagValues(client, 'idx:users', 'city');
    expect(vals).toEqual(['Portland', 'Seattle']);
  });

  it('returns empty array on non-array reply', async () => {
    const client = { call: vi.fn().mockResolvedValue(null) };
    const svc = new SearchQueryService();
    const vals = await svc.fetchTagValues(client, 'idx:users', 'city');
    expect(vals).toEqual([]);
  });
});

describe('SearchQueryService.listIndexes', () => {
  it('returns names from FT._LIST', async () => {
    const client = { call: vi.fn().mockResolvedValue(['idx:users', 'idx:products']) };
    const svc = new SearchQueryService();
    const names = await svc.listIndexes(client);
    expect(names).toEqual(['idx:users', 'idx:products']);
    expect(client.call).toHaveBeenCalledWith('FT._LIST');
  });

  it('coerces Buffer index names', async () => {
    const client = { call: vi.fn().mockResolvedValue([Buffer.from('idx:users')]) };
    const svc = new SearchQueryService();
    expect(await svc.listIndexes(client)).toEqual(['idx:users']);
  });

  it('returns empty array on non-array reply', async () => {
    const client = { call: vi.fn().mockResolvedValue(null) };
    const svc = new SearchQueryService();
    expect(await svc.listIndexes(client)).toEqual([]);
  });
});

describe('SearchQueryService.fetchIndexSchema robustness', () => {
  it('skips earlier nested-array values that aren\'t the attributes section', async () => {
    const reply = [
      'index_name', 'idx:x',
      'index_definition', ['key_type', 'HASH', 'prefixes', ['user:']],
      'attributes', [
        ['identifier', 'name', 'attribute', 'name', 'type', 'TEXT'],
      ],
    ];
    const client = { call: vi.fn().mockResolvedValue(reply) };
    const svc = new SearchQueryService();
    const fields = await svc.fetchIndexSchema(client, 'idx:x');
    expect(fields).toEqual([{ name: 'name', type: 'TEXT', attribute: 'name' }]);
  });

  it('accepts Buffer-valued keys/values', async () => {
    const reply = [
      Buffer.from('attributes'), [
        [Buffer.from('identifier'), Buffer.from('city'), Buffer.from('attribute'), Buffer.from('city'), Buffer.from('type'), Buffer.from('TAG')],
      ],
    ];
    const client = { call: vi.fn().mockResolvedValue(reply) };
    const svc = new SearchQueryService();
    const fields = await svc.fetchIndexSchema(client, 'idx:x');
    expect(fields).toEqual([{ name: 'city', type: 'TAG', attribute: 'city' }]);
  });

  it('skips rows with unknown type', async () => {
    const reply = [
      'attributes', [
        ['identifier', 'mystery', 'attribute', 'mystery', 'type', 'WIZARDRY'],
        ['identifier', 'name', 'attribute', 'name', 'type', 'TEXT'],
      ],
    ];
    const client = { call: vi.fn().mockResolvedValue(reply) };
    const svc = new SearchQueryService();
    const fields = await svc.fetchIndexSchema(client, 'idx:x');
    expect(fields).toEqual([{ name: 'name', type: 'TEXT', attribute: 'name' }]);
  });

  it('throws on non-array reply', async () => {
    const client = { call: vi.fn().mockResolvedValue('OK') };
    const svc = new SearchQueryService();
    await expect(svc.fetchIndexSchema(client, 'x')).rejects.toThrow(/non-array/);
  });

  it('throws when attributes value is not an array', async () => {
    const client = { call: vi.fn().mockResolvedValue(['attributes', 'oops']) };
    const svc = new SearchQueryService();
    await expect(svc.fetchIndexSchema(client, 'x')).rejects.toThrow(/attributes value/);
  });
});
