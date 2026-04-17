import { describe, it, expect, vi } from 'vitest';

vi.mock('vscode', () => ({}));

import { SearchQueryService, parseSearchResponse, parseAggregateResponse, parseInfoResponse, parseInfoAttributes } from '../SearchQueryService';

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

  it('captures standalone flag tokens like WITHSUFFIXTRIE and SORTABLE', async () => {
    const reply = [
      'attributes', [
        ['identifier', 'name', 'attribute', 'name', 'type', 'TEXT', 'WEIGHT', '2', 'SORTABLE', 'WITHSUFFIXTRIE'],
        ['identifier', 'city', 'attribute', 'city', 'type', 'TAG', 'SEPARATOR', ',', 'NOINDEX'],
        ['identifier', 'age',  'attribute', 'age',  'type', 'NUMERIC', 'SORTABLE'],
      ],
    ];
    const client = { call: vi.fn().mockResolvedValue(reply) };
    const svc = new SearchQueryService();
    const fields = await svc.fetchIndexSchema(client, 'idx:x');
    expect(fields).toEqual([
      { name: 'name', type: 'TEXT', attribute: 'name', flags: ['SORTABLE', 'WITHSUFFIXTRIE'] },
      { name: 'city', type: 'TAG',  attribute: 'city', flags: ['NOINDEX'] },
      { name: 'age',  type: 'NUMERIC', attribute: 'age', flags: ['SORTABLE'] },
    ]);
  });
});

describe('parseSearchResponse', () => {
  it('parses total + key/field rows', () => {
    const raw = [
      52,
      'user:13', ['name', 'Alice', 'age', '26'],
      'user:47', ['name', 'Bob',   'age', '26'],
    ];
    expect(parseSearchResponse(raw)).toEqual({
      total: 52,
      hits: [
        { key: 'user:13', fields: { name: 'Alice', age: '26' } },
        { key: 'user:47', fields: { name: 'Bob',   age: '26' } },
      ],
    });
  });

  it('handles empty result set', () => {
    expect(parseSearchResponse([0])).toEqual({ total: 0, hits: [] });
  });

  it('coerces Buffer keys and field values', () => {
    const raw = [
      1,
      Buffer.from('user:1'),
      [Buffer.from('name'), Buffer.from('Carol')],
    ];
    expect(parseSearchResponse(raw)).toEqual({
      total: 1,
      hits: [{ key: 'user:1', fields: { name: 'Carol' } }],
    });
  });

  it('throws on non-array reply', () => {
    expect(() => parseSearchResponse('OK')).toThrow(/unexpected/);
  });
});

describe('parseAggregateResponse', () => {
  it('parses total + flat key/value rows', () => {
    const raw = [
      2,
      ['city', 'Portland', 'count', '12'],
      ['city', 'Seattle',  'count', '7'],
    ];
    expect(parseAggregateResponse(raw)).toEqual({
      total: 2,
      rows: [
        { city: 'Portland', count: '12' },
        { city: 'Seattle',  count: '7' },
      ],
    });
  });
});

describe('parseInfoResponse', () => {
  it('flattens key/value pairs to a string map', () => {
    const raw = ['index_name', 'idx:users', 'num_docs', '1000'];
    expect(parseInfoResponse(raw)).toEqual({ index_name: 'idx:users', num_docs: '1000' });
  });

  it('serializes nested arrays as JSON', () => {
    const raw = ['attributes', [['identifier', 'name']]];
    const result = parseInfoResponse(raw);
    expect(result.attributes).toContain('identifier');
  });
});

describe('SearchQueryService.fetchVectorBytes', () => {
  it('returns a Buffer of expected length for the field', async () => {
    const buf = Buffer.alloc(256, 1);
    const client = { call: async () => buf };
    const svc = new SearchQueryService();
    const out = await svc.fetchVectorBytes(client, 'product:1', 'embedding');
    expect(Buffer.isBuffer(out)).toBe(true);
    expect(out.byteLength).toBe(256);
  });

  it('throws if HGET returns null', async () => {
    const client = { call: async () => null };
    const svc = new SearchQueryService();
    await expect(svc.fetchVectorBytes(client, 'k', 'f')).rejects.toThrow(/no vector bytes/);
  });

  it('prefers callBuffer over call to preserve binary bytes', async () => {
    const buf = Buffer.alloc(256, 0xff);
    const call = vi.fn().mockResolvedValue('utf8-mangled');
    const callBuffer = vi.fn().mockResolvedValue(buf);
    const client = { call, callBuffer };
    const svc = new SearchQueryService();
    const out = await svc.fetchVectorBytes(client, 'product:1', 'embedding');
    expect(out.byteLength).toBe(256);
    expect(callBuffer).toHaveBeenCalledWith('HGET', 'product:1', 'embedding');
    expect(call).not.toHaveBeenCalled();
  });
});

describe('parseInfoAttributes — vector metadata', () => {
  it('extracts DIM, algorithm, DISTANCE_METRIC for a VECTOR field', () => {
    const raw = [
      'attributes', [
        ['identifier', 'embedding', 'attribute', 'embedding', 'type', 'VECTOR',
         'algorithm', 'HNSW', 'DIM', '64', 'DISTANCE_METRIC', 'COSINE',
         'data_type', 'FLOAT32', 'M', '16', 'EF_CONSTRUCTION', '200']
      ]
    ];
    const fields = parseInfoAttributes(raw);
    expect(fields).toHaveLength(1);
    expect(fields[0]).toMatchObject({
      name: 'embedding',
      type: 'VECTOR',
      vectorDim: 64,
      vectorAlgorithm: 'HNSW',
      vectorDistanceMetric: 'COSINE',
    });
  });

  it('parses valkey-search nested VECTOR metadata (index wrapper + nested algorithm)', () => {
    const raw = [
      'attributes', [
        ['identifier', 'embedding', 'attribute', 'embedding', 'type', 'VECTOR',
         'index', [
           'capacity', 10240,
           'dimensions', 64,
           'distance_metric', 'COSINE',
           'size', '2000',
           'data_type', 'FLOAT32',
           'algorithm', ['name', 'FLAT', 'block_size', 1024],
         ]],
      ]
    ];
    const fields = parseInfoAttributes(raw);
    expect(fields).toHaveLength(1);
    expect(fields[0]).toMatchObject({
      name: 'embedding',
      type: 'VECTOR',
      vectorDim: 64,
      vectorAlgorithm: 'FLAT',
      vectorDistanceMetric: 'COSINE',
    });
  });

  it('parses non-vector fields without vector metadata', () => {
    const raw = [
      'attributes', [
        ['identifier', 'category', 'attribute', 'category', 'type', 'TAG', 'SEPARATOR', ',']
      ]
    ];
    const fields = parseInfoAttributes(raw);
    expect(fields[0].type).toBe('TAG');
    expect(fields[0].vectorDim).toBeUndefined();
  });
});
