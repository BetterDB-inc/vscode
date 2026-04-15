import { BuilderState, IndexField } from '../../shared/types';

export type WebviewToExtMessage =
  | { command: 'executeInCli'; commandLine: string }
  | { command: 'sendToCli'; commandLine: string }
  | { command: 'fetchIndexes' }
  | { command: 'fetchSchema'; index: string }
  | { command: 'fetchTagValues'; index: string; field: string };

export type ExtToWebviewMessage =
  | { command: 'init'; indexes: string[]; selectedIndex: string | null }
  | { command: 'indexSchema'; index: string; fields: IndexField[] }
  | { command: 'tagValues'; field: string; values: string[] }
  | { command: 'cliAck'; action: 'execute' | 'send'; ok: boolean; error?: string }
  | { command: 'connectionLost' }
  | { command: 'selectIndex'; indexName: string };

export type { BuilderState, IndexField };

export interface VsCodeApi {
  postMessage(message: WebviewToExtMessage): void;
  getState<T = unknown>(): T | undefined;
  setState<T = unknown>(state: T): void;
}
