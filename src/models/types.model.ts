export interface ScanResult {
  keys: string[];
  cursor: string;
}

export interface WebviewMessage {
  command: string;
  key?: string;
  type?: string;
  value?: unknown;
  field?: string;
  index?: number;
  score?: number;
  member?: string;
  ttl?: number;
}

export interface KeyEditorState {
  connectionId: string;
  key: string;
  type: string;
  value: unknown;
  ttl: number;
}
