import { BuilderState, IndexField, SearchResult } from '../../shared/types';

export type WebviewToExtMessage =
  | { command: 'executeInCli'; commandLine: string }
  | { command: 'sendToCli'; commandLine: string }
  | { command: 'executeQuery'; commandLine: string }
  | { command: 'openKey'; key: string }
  | { command: 'fetchIndexes' }
  | { command: 'fetchSchema'; index: string }
  | { command: 'fetchTagValues'; index: string; field: string };

export type ExtToWebviewMessage =
  | { command: 'init'; indexes: string[]; selectedIndex: string | null }
  | { command: 'indexSchema'; index: string; fields: IndexField[] }
  | { command: 'tagValues'; field: string; values: string[] }
  | { command: 'cliAck'; action: 'execute' | 'send'; ok: boolean; error?: string }
  | { command: 'queryResult'; ok: true; total: number; hits: SearchResult[]; tookMs: number; commandLine: string }
  | { command: 'queryResult'; ok: false; error: string; commandLine: string }
  | { command: 'connectionLost' }
  | { command: 'selectIndex'; indexName: string }
  | { command: 'error'; context: string; message: string };

export type { BuilderState, IndexField, SearchResult };

export interface VsCodeApi {
  postMessage(message: WebviewToExtMessage): void;
  getState<T = unknown>(): T | undefined;
  setState<T = unknown>(state: T): void;
}
