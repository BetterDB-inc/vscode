export type { KeyType } from '../shared/types';
import type { KeyType } from '../shared/types';

export interface KeyInfo {
  key: string;
  type: KeyType;
  ttl: number;
  size?: number;
  encoding?: string;
}

export interface KeyValue {
  key: string;
  type: KeyType;
  value: StringValue | HashValue | ListValue | SetValue | ZSetValue | StreamValue | JsonValue;
  ttl: number;
}

export interface StringValue {
  type: 'string';
  value: string;
}

export interface HashValue {
  type: 'hash';
  fields: Array<{ field: string; value: string }>;
  total: number;
}

export interface ListValue {
  type: 'list';
  elements: string[];
  total: number;
}

export interface SetValue {
  type: 'set';
  members: string[];
  total: number;
}

export interface ZSetValue {
  type: 'zset';
  members: Array<{ member: string; score: number }>;
  total: number;
}

export interface StreamValue {
  type: 'stream';
  entries: Array<{ id: string; fields: Record<string, string> }>;
  length: number;
  firstEntry?: string;
  lastEntry?: string;
}

export interface JsonValue {
  type: 'json';
  value: string;
}
