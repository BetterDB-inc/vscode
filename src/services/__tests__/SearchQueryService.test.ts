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
    const client = { call: vi.fn().mockResolvedValue(ftInfoResponse) } as any;
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
    const client = { call: vi.fn().mockResolvedValue(['Portland', 'Seattle', 'portland']) } as any;
    const svc = new SearchQueryService();
    const vals = await svc.fetchTagValues(client, 'idx:users', 'city');
    expect(vals).toEqual(['Portland', 'Seattle', 'portland']);
    expect(client.call).toHaveBeenCalledWith('FT.TAGVALS', 'idx:users', 'city');
  });
});
