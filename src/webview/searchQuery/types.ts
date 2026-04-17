import { BuilderState, IndexField, SearchResult, SearchCapabilities } from '../../shared/types';

export type WebviewToExtMessage =
  | { command: 'executeInCli'; commandLine: string }
  | { command: 'sendToCli'; commandLine: string }
  | {
      command: 'executeQuery';
      commandLine: string;
      vectorBytes?: string;
      scoreField?: string;
      distanceMetric?: 'COSINE' | 'L2' | 'IP';
    }
  | { command: 'openKey'; key: string }
  | { command: 'fetchIndexes' }
  | { command: 'fetchSchema'; index: string }
  | { command: 'fetchTagValues'; index: string; field: string }
  | { command: 'pickVectorKey'; index: string };

export type ExtToWebviewMessage =
  | { command: 'init'; indexes: string[]; selectedIndex: string | null; caps?: SearchCapabilities; connection?: { host: string; port: number } }
  | { command: 'indexSchema'; index: string; fields: IndexField[] }
  | { command: 'tagValues'; field: string; values: string[] }
  | { command: 'cliAck'; action: 'execute' | 'send'; ok: boolean; error?: string }
  | {
      command: 'queryResult';
      ok: true;
      total: number;
      hits: SearchResult[];
      tookMs: number;
      commandLine: string;
      isVectorQuery?: boolean;
      scoreField?: string;
      distanceMetric?: 'COSINE' | 'L2' | 'IP';
    }
  | { command: 'queryResult'; ok: false; error: string; commandLine: string }
  | { command: 'connectionLost' }
  | { command: 'selectIndex'; indexName: string }
  | { command: 'vectorKeyPicked'; key: string; bytes: string; byteLength: number }
  | { command: 'error'; context: string; message: string };

export type { BuilderState, IndexField, SearchResult };

export interface VsCodeApi {
  postMessage(message: WebviewToExtMessage): void;
  getState<T = unknown>(): T | undefined;
  setState<T = unknown>(state: T): void;
}
