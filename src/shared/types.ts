export type KeyType = 'string' | 'hash' | 'list' | 'set' | 'zset' | 'stream' | 'json' | 'unknown';

export interface KeyData {
  key: string;
  type: KeyType;
  ttl: number;
  value: KeyValueData;
}

export type KeyValueData =
  | { type: 'string'; value: string }
  | { type: 'hash'; fields: Array<{ field: string; value: string }> }
  | { type: 'list'; elements: string[]; total: number }
  | { type: 'set'; members: string[]; total: number }
  | { type: 'zset'; members: Array<{ member: string; score: number }>; total: number }
  | { type: 'stream'; entries: Array<{ id: string; fields: Record<string, string> }>; length: number };
