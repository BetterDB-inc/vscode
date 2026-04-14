import { FtIndexInfo, SearchResult } from '../../shared/types';

export type { SearchResult };

export type ExtensionMessage =
  | { command: 'init'; indexes: FtIndexInfo[]; selectedIndex: string | null; history: string[] }
  | { command: 'queryResult'; results: SearchResult[]; total: number; tookMs: number; error?: string }
  | { command: 'connectionLost' }
  | { command: 'selectIndex'; indexName: string };

export type InitialData = Omit<Extract<ExtensionMessage, { command: 'init' }>, 'command'>;

export type WebviewMessage =
  | { command: 'executeQuery'; index: string; query: string }
  | { command: 'openKey'; key: string }
  | { command: 'saveHistory'; query: string };

export interface VsCodeApi {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
}
