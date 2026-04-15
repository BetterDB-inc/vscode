export type KeyType = 'string' | 'hash' | 'list' | 'set' | 'zset' | 'stream' | 'json' | 'unknown';

export type FtCommand = 'FT.SEARCH' | 'FT.AGGREGATE' | 'FT.INFO';

export interface IndexField {
  name: string;
  type: FtFieldType;
  attribute?: string;
}

export interface TagValue { selected: string[]; }

export type NumericOperator = 'between' | 'eq' | 'gt' | 'gte' | 'lt' | 'lte';
export interface NumericValue {
  operator: NumericOperator;
  value1: number | null;
  value2: number | null;
}

export interface TextValue { term: string; }

export interface GeoValue {
  lon: number | null;
  lat: number | null;
  radius: number | null;
  unit: 'km' | 'm' | 'mi' | 'ft';
}

export type FieldValue = TagValue | NumericValue | TextValue | GeoValue;

export interface FieldFilter {
  name: string;
  type: FtFieldType;
  value: FieldValue;
}

export interface BuilderState {
  indexName: string;
  command: FtCommand;
  fields: FieldFilter[];
  modified: boolean;
}

export type FtFieldType = 'TEXT' | 'TAG' | 'NUMERIC' | 'VECTOR' | 'GEO' | 'GEOSHAPES';

export interface FtFieldInfo {
  name: string;
  type: FtFieldType;
  vectorDimension?: number;
  vectorAlgorithm?: string;
  vectorDistanceMetric?: string;
}

export interface SearchResult {
  key: string;
  fields: Record<string, string>;
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
