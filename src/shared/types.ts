export type KeyType = 'string' | 'hash' | 'list' | 'set' | 'zset' | 'stream' | 'json' | 'unknown';

export type FtFieldType = 'TEXT' | 'TAG' | 'NUMERIC' | 'VECTOR' | 'GEO' | 'GEOSHAPES';

export interface FtFieldInfo {
  name: string;
  type: FtFieldType;
  vectorDimension?: number;
  vectorAlgorithm?: string;
  vectorDistanceMetric?: string;
}

export interface FtIndexInfo {
  name: string;
  numDocs: number;
  indexingState: 'indexed' | 'indexing';
  percentIndexed: number;
  fields: FtFieldInfo[];
  indexOn: 'HASH' | 'JSON';
  prefixes: string[];
}
