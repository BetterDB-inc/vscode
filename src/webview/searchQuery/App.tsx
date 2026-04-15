import { useCallback, useEffect, useState } from 'react';
import styles from './styles.module.css';
import { useVsCode } from './VsCodeContext';
import { IndexSelector } from './components/IndexSelector';
import { QueryBuilder } from './components/QueryBuilder';
import { CommandPreview } from './components/CommandPreview';
import { Toolbar } from './components/Toolbar';
import { ResultsTable } from './components/ResultsTable';
import { generateCommand } from './services/queryGenerator';
import { BuilderState, IndexField, FieldFilter, FtFieldType, SearchResult } from '../../shared/types';
import { ExtToWebviewMessage, WebviewToExtMessage } from './types';

const emptyValueFor = (t: FtFieldType): FieldFilter['value'] => {
  switch (t) {
    case 'TAG': return { selected: [] };
    case 'NUMERIC': return { operator: 'eq', value1: null, value2: null };
    case 'TEXT': return { term: '' };
    case 'GEO': return { lon: null, lat: null, radius: null, unit: 'km' };
    default: return { selected: [] };
  }
};

const buildInitialState = (indexName: string, schema: IndexField[]): BuilderState => ({
  indexName,
  command: 'FT.SEARCH',
  fields: schema.map((f) => ({ name: f.name, type: f.type, value: emptyValueFor(f.type) })),
  modified: false,
});

interface ErrorInfo { context: string; message: string; }

export function App() {
  const vscode = useVsCode();
  const [indexes, setIndexes] = useState<string[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [schema, setSchema] = useState<IndexField[]>([]);
  const [tagValues, setTagValues] = useState<Record<string, string[]>>({});
  const [state, setState] = useState<BuilderState | null>(null);
  const [preview, setPreview] = useState('');
  const [collapsed, setCollapsed] = useState(false);
  const [connectionLost, setConnectionLost] = useState(false);
  const [error, setError] = useState<ErrorInfo | null>(null);
  const [ack, setAck] = useState<{ action: 'execute' | 'send'; ok: boolean; error?: string } | null>(null);
  const [results, setResults] = useState<{ total: number; hits: SearchResult[]; tookMs: number; error: string | null } | null>(null);

  const post = useCallback((msg: WebviewToExtMessage) => vscode.postMessage(msg), [vscode]);

  useEffect(() => {
    const handler = (event: MessageEvent<ExtToWebviewMessage>) => {
      const msg = event.data;
      switch (msg.command) {
        case 'init':
          setIndexes(msg.indexes);
          if (msg.selectedIndex) setSelected(msg.selectedIndex);
          break;
        case 'indexSchema':
          setSchema(msg.fields);
          setTagValues({});
          setState(buildInitialState(msg.index, msg.fields));
          setError(null);
          break;
        case 'tagValues':
          setTagValues((tv) => ({ ...tv, [msg.field]: msg.values }));
          break;
        case 'cliAck':
          setAck({ action: msg.action, ok: msg.ok, error: msg.error });
          break;
        case 'queryResult':
          if (msg.ok) {
            setResults({ total: msg.total, hits: msg.hits, tookMs: msg.tookMs, error: null });
          } else {
            setResults({ total: 0, hits: [], tookMs: 0, error: msg.error });
          }
          break;
        case 'connectionLost':
          setConnectionLost(true);
          break;
        case 'selectIndex':
          setSelected(msg.indexName);
          break;
        case 'error':
          setError({ context: msg.context, message: msg.message });
          break;
      }
    };
    window.addEventListener('message', handler);
    post({ command: 'fetchIndexes' });
    return () => window.removeEventListener('message', handler);
  }, [post]);

  useEffect(() => {
    if (selected) post({ command: 'fetchSchema', index: selected });
  }, [selected, post]);

  useEffect(() => {
    if (state) setPreview(generateCommand(state));
  }, [state]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        if (!connectionLost && preview.trim().length > 0) {
          post({ command: 'executeQuery', commandLine: preview });
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [preview, connectionLost, post]);

  const onPreviewChange = (next: string, manual: boolean) => {
    setPreview(next);
    if (manual && state) setState({ ...state, modified: true });
  };

  const onRequestTagValues = (field: string) => {
    if (selected) post({ command: 'fetchTagValues', index: selected, field });
  };

  return (
    <div className={styles.app}>
      {connectionLost && <div className={styles.banner}>Connection lost. Reconnect to continue.</div>}
      {error && (
        <div className={styles.banner} role="alert">
          {error.context}: {error.message}
          <button className={styles.bannerDismiss} onClick={() => setError(null)} aria-label="Dismiss">×</button>
        </div>
      )}

      <div className={styles.header}>
        <IndexSelector indexes={indexes} selected={selected} onChange={setSelected} />
      </div>

      {state && schema.length > 0 && (
        <QueryBuilder
          state={state}
          schema={schema}
          tagValues={tagValues}
          collapsed={collapsed}
          onToggleCollapsed={() => setCollapsed((c) => !c)}
          onChange={setState}
          onRequestTagValues={onRequestTagValues}
        />
      )}
      {selected && state && schema.length === 0 && (
        <div className={styles.emptyHint}>Index has no schema fields.</div>
      )}

      <CommandPreview value={preview} onChange={onPreviewChange} disabled={connectionLost} />

      <Toolbar
        commandLine={preview}
        disabled={connectionLost || preview.trim().length === 0}
        onExecute={() => post({ command: 'executeQuery', commandLine: preview })}
        onSendToCli={() => post({ command: 'sendToCli', commandLine: preview })}
        ack={ack}
      />

      {results && (
        <ResultsTable
          total={results.total}
          hits={results.hits}
          tookMs={results.tookMs}
          error={results.error}
          onOpenKey={(key) => post({ command: 'openKey', key })}
        />
      )}
    </div>
  );
}
