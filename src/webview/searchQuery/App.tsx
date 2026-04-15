import { useCallback, useEffect, useState } from 'react';
import styles from './styles.module.css';
import { useVsCode } from './VsCodeContext';
import { ErrorBoundary } from './ErrorBoundary';
import { IndexSelector } from './components/IndexSelector';
import { QueryBuilder } from './components/QueryBuilder';
import { CommandPreview } from './components/CommandPreview';
import { Toolbar } from './components/Toolbar';
import { generateCommand } from './services/queryGenerator';
import { BuilderState, FtIndexInfo, IndexField, FieldFilter, FtFieldType } from '../../shared/types';
import { ExtToWebviewMessage, WebviewToExtMessage } from './types';

const emptyValueFor = (t: FtFieldType): FieldFilter['value'] => {
  switch (t) {
    case 'TAG': return { selected: [] };
    case 'NUMERIC': return { operator: 'eq', value1: null, value2: null };
    case 'TEXT': return { term: '' };
    case 'GEO': return { lon: null, lat: null, radius: null, unit: 'km' };
    case 'VECTOR': return { selected: [] };
    default: return { selected: [] };
  }
};

const buildInitialState = (indexName: string, schema: IndexField[]): BuilderState => ({
  indexName,
  command: 'FT.SEARCH',
  fields: schema.map((f) => ({ name: f.name, type: f.type, enabled: false, value: emptyValueFor(f.type) })),
  modified: false,
});

const toIndexInfo = (name: string): FtIndexInfo => ({
  name,
  numDocs: 0,
  indexingState: 'indexed',
  percentIndexed: 100,
  fields: [],
  indexOn: 'HASH',
  prefixes: [],
});

export function App() {
  const vscode = useVsCode();
  const [indexes, setIndexes] = useState<FtIndexInfo[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [schema, setSchema] = useState<IndexField[]>([]);
  const [tagValues, setTagValues] = useState<Record<string, string[]>>({});
  const [state, setState] = useState<BuilderState | null>(null);
  const [preview, setPreview] = useState('');
  const [collapsed, setCollapsed] = useState(false);
  const [connectionLost, setConnectionLost] = useState(false);
  const [ack, setAck] = useState<{ action: 'execute' | 'send'; ok: boolean; error?: string } | null>(null);

  const post = useCallback((msg: WebviewToExtMessage) => vscode.postMessage(msg), [vscode]);

  useEffect(() => {
    const handler = (event: MessageEvent<ExtToWebviewMessage>) => {
      const msg = event.data;
      switch (msg.command) {
        case 'init':
          setIndexes(msg.indexes.map(toIndexInfo));
          if (msg.selectedIndex) setSelected(msg.selectedIndex);
          break;
        case 'indexSchema':
          setSchema(msg.fields);
          setState(buildInitialState(msg.index, msg.fields));
          break;
        case 'tagValues':
          setTagValues((tv) => ({ ...tv, [msg.field]: msg.values }));
          break;
        case 'cliAck':
          setAck({ action: msg.action, ok: msg.ok, error: msg.error });
          break;
        case 'connectionLost':
          setConnectionLost(true);
          break;
        case 'selectIndex':
          setSelected(msg.indexName);
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

  const onBuilderChange = (next: BuilderState) => {
    setState(next);
  };

  const onPreviewChange = (next: string, manual: boolean) => {
    setPreview(next);
    if (manual && state) setState({ ...state, modified: true });
  };

  const onRequestTagValues = (field: string) => {
    if (selected) post({ command: 'fetchTagValues', index: selected, field });
  };

  return (
    <ErrorBoundary>
      <div className={styles.app}>
        {connectionLost && <div className={styles.banner}>Connection lost. Reconnect to continue.</div>}

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
            onChange={onBuilderChange}
            onRequestTagValues={onRequestTagValues}
          />
        )}

        <CommandPreview value={preview} onChange={onPreviewChange} disabled={connectionLost} />

        <Toolbar
          commandLine={preview}
          disabled={connectionLost}
          onExecute={() => post({ command: 'executeInCli', commandLine: preview })}
          onSendToCli={() => post({ command: 'sendToCli', commandLine: preview })}
          ack={ack}
        />
      </div>
    </ErrorBoundary>
  );
}
