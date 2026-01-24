export interface KeyData {
  key: string;
  type: 'string' | 'hash' | 'list' | 'set' | 'zset' | 'stream';
  ttl: number;
  value: StringValue | HashValue | ListValue | SetValue | ZSetValue | StreamValue;
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
}

export type ValueType = StringValue | HashValue | ListValue | SetValue | ZSetValue | StreamValue;

export interface VsCodeApi {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
}
