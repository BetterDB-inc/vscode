import { useCallback, useEffect, useState } from 'react';
import styles from './styles.module.css';
import { useVsCode } from './VsCodeContext';
import { IndexSelector } from './components/IndexSelector';
import { QueryBuilder } from './components/QueryBuilder';
import { CommandPreview } from './components/CommandPreview';
import { Toolbar } from './components/Toolbar';
import { ResultsTable } from './components/ResultsTable';
import { KnnClause } from './components/KnnClause';
import { generateCommand } from './services/queryGenerator';
import { parseVectorInput } from './utils/parseVector';
import { formatShellCommand } from './utils/formatShellCommand';
import {
  BuilderState,
  IndexField,
  FieldFilter,
  FtFieldType,
  SearchResult,
  SearchCapabilities,
  KnnClauseState,
} from '../../shared/types';
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
  fields: schema.map((f) => ({ name: f.name, type: f.type, value: emptyValueFor(f.type), flags: f.flags })),
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
  const [results, setResults] = useState<{
    total: number;
    hits: SearchResult[];
    tookMs: number;
    error: string | null;
    isVectorQuery?: boolean;
    scoreField?: string;
    distanceMetric?: 'COSINE' | 'L2' | 'IP';
  } | null>(null);
  const [caps, setCaps] = useState<SearchCapabilities>({
    hasSearch: false, supportsVector: false, supportsText: false, engineLabel: '',
  });
  const [connection, setConnection] = useState<{ host: string; port: number } | null>(null);
  const [knn, setKnn] = useState<KnnClauseState>({
    enabled: false, field: '', k: 10, asName: '__embedding_score',
  });

  const post = useCallback((msg: WebviewToExtMessage) => vscode.postMessage(msg), [vscode]);

  useEffect(() => {
    const handler = (event: MessageEvent<ExtToWebviewMessage>) => {
      const msg = event.data;
      switch (msg.command) {
        case 'init':
          setIndexes(msg.indexes);
          if (msg.caps) setCaps(msg.caps);
          if (msg.connection) setConnection(msg.connection);
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
            setResults({
              total: msg.total,
              hits: msg.hits,
              tookMs: msg.tookMs,
              error: null,
              isVectorQuery: msg.isVectorQuery,
              scoreField: msg.scoreField,
              distanceMetric: msg.distanceMetric,
            });
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
        case 'vectorKeyPicked':
          setKnn((prev) => ({
            ...prev,
            source: { kind: 'key', key: msg.key, bytes: msg.bytes },
            pasteError: undefined,
          }));
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

  const vectorField = schema.find((f) => f.type === 'VECTOR');
  const knnClauseVisible = caps.supportsVector && !!vectorField;

  useEffect(() => {
    if (knnClauseVisible && vectorField && (!knn.enabled || knn.field !== vectorField.name)) {
      setKnn((prev) => ({ ...prev, enabled: true, field: vectorField.name }));
    } else if (!knnClauseVisible && knn.enabled) {
      setKnn((prev) => ({ ...prev, enabled: false, source: undefined, pasteError: undefined }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [knnClauseVisible, vectorField?.name]);

  useEffect(() => {
    if (!knn.pasteRaw || !vectorField?.vectorDim) return;
    const handle = setTimeout(() => {
      const parsed = parseVectorInput(knn.pasteRaw!, vectorField.vectorDim!);
      if (parsed.ok) {
        const b64 = btoa(String.fromCharCode(...new Uint8Array(parsed.bytes)));
        setKnn((prev) => ({ ...prev, source: { kind: 'paste', bytes: b64 }, pasteError: undefined }));
      } else {
        setKnn((prev) => ({ ...prev, source: undefined, pasteError: parsed.error }));
      }
    }, 200);
    return () => clearTimeout(handle);
  }, [knn.pasteRaw, vectorField?.vectorDim]);

  useEffect(() => {
    if (state) setPreview(generateCommand(state, knn.enabled ? knn : undefined));
  }, [state, knn]);

  const buildExecute = useCallback((): WebviewToExtMessage => ({
    command: 'executeQuery',
    commandLine: preview,
    vectorBytes: knn.enabled ? knn.source?.bytes : undefined,
    scoreField: knn.enabled ? knn.asName : undefined,
    distanceMetric: knn.enabled ? vectorField?.vectorDistanceMetric : undefined,
  }), [preview, knn, vectorField]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        if (!connectionLost && preview.trim().length > 0) {
          post(buildExecute());
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [preview, connectionLost, post, buildExecute]);

  const onPreviewChange = (next: string, manual: boolean) => {
    setPreview(next);
    if (manual && state) setState({ ...state, modified: true });
  };

  const onRequestTagValues = (field: string) => {
    if (selected) post({ command: 'fetchTagValues', index: selected, field });
  };

  const shellCommand = (() => {
    if (!knn.enabled || !knn.source?.bytes || !connection || !selected) return undefined;
    const match = preview.match(/^[A-Z._]+\s+\S+\s+(?:"((?:\\.|[^"\\])*)"|(\*))$/);
    const queryString = match ? (match[1] ?? match[2] ?? '*') : '*';
    return formatShellCommand({
      connection,
      indexName: selected,
      queryString,
      vectorBase64: knn.source.bytes,
    });
  })();

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
        {caps.hasSearch && caps.engineLabel && (
          <span className={styles.engineBadge} title="Search engine detected via capability probe">
            {caps.engineLabel}
          </span>
        )}
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

      {knnClauseVisible && vectorField && (
        <KnnClause
          state={knn}
          vectorField={vectorField}
          onChange={setKnn}
          onPickKey={() => selected && post({ command: 'pickVectorKey', index: selected })}
        />
      )}

      <CommandPreview
        value={preview}
        onChange={onPreviewChange}
        disabled={connectionLost}
        isVectorPreview={knn.enabled}
      />

      <Toolbar
        commandLine={preview}
        disabled={connectionLost || preview.trim().length === 0}
        onExecute={() => post(buildExecute())}
        onSendToCli={() => post({ command: 'sendToCli', commandLine: preview })}
        ack={ack}
        knnEnabled={knn.enabled}
        shellCommand={shellCommand}
      />

      {results && (
        <ResultsTable
          total={results.total}
          hits={results.hits}
          tookMs={results.tookMs}
          error={results.error}
          onOpenKey={(key) => post({ command: 'openKey', key })}
          isVectorQuery={results.isVectorQuery}
          scoreField={results.scoreField}
          distanceMetric={results.distanceMetric}
          vectorFieldName={vectorField?.name}
        />
      )}
    </div>
  );
}
