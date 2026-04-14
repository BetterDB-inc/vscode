import React, { useEffect, useRef, useState } from 'react';
import { FtIndexInfo } from '../../shared/types';
import { ExtensionMessage, InitialData, SearchResult } from './types';
import { useVsCode } from './VsCodeContext';
import { IndexSelector } from './components/IndexSelector';
import { QueryEditor } from './components/QueryEditor';
import { ResultsTable } from './components/ResultsTable';
import { QueryHistory } from './components/QueryHistory';

interface Props {
  initialData: InitialData;
}

export const App: React.FC<Props> = ({ initialData }) => {
  const vscode = useVsCode();

  const [indexes, setIndexes] = useState<FtIndexInfo[]>(initialData.indexes ?? []);
  const [selectedIndex, setSelectedIndex] = useState<string | null>(initialData.selectedIndex ?? null);
  const [query, setQuery] = useState('');
  const [history, setHistory] = useState<string[]>(initialData.history ?? []);
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [total, setTotal] = useState(0);
  const [tookMs, setTookMs] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [connected, setConnected] = useState(true);
  const pendingQueryRef = useRef<string>('');

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const msg = event.data as ExtensionMessage;
      switch (msg.command) {
        case 'init':
          setIndexes(msg.indexes);
          setSelectedIndex(msg.selectedIndex);
          setHistory(msg.history);
          break;
        case 'queryResult':
          setResults(msg.results);
          setTotal(msg.total);
          setTookMs(msg.tookMs);
          setError(msg.error ?? null);
          setLoading(false);
          if (!msg.error) {
            vscode.postMessage({ command: 'saveHistory', query: pendingQueryRef.current });
          }
          break;
        case 'connectionLost':
          setConnected(false);
          break;
        case 'selectIndex':
          setSelectedIndex(msg.indexName);
          break;
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const runQuery = () => {
    if (!selectedIndex || !query.trim() || loading) {
      return;
    }
    setLoading(true);
    setError(null);
    pendingQueryRef.current = query.trim();
    vscode.postMessage({ command: 'executeQuery', index: selectedIndex, query: query.trim() });
  };

  const handleKeyClick = (key: string) => {
    vscode.postMessage({ command: 'openKey', key });
  };

  const handleHistorySelect = (q: string) => {
    setQuery(q);
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      background: 'var(--vscode-editor-background)',
      color: 'var(--vscode-editor-foreground)',
      fontFamily: 'var(--vscode-font-family)',
      fontSize: '13px',
    }}>
      {!connected && (
        <div style={{
          background: 'var(--vscode-warningForeground)',
          color: 'var(--vscode-editor-background)',
          padding: '6px 12px',
          textAlign: 'center',
          fontWeight: 600,
        }}>
          Connection lost
        </div>
      )}

      <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ opacity: 0.7 }}>Index:</span>
          <IndexSelector indexes={indexes} selected={selectedIndex} onChange={setSelectedIndex} />
          <QueryHistory history={history} onSelect={handleHistorySelect} />
        </div>

        <QueryEditor
          value={query}
          onChange={setQuery}
          onRun={runQuery}
          disabled={loading || !connected}
        />

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            onClick={runQuery}
            disabled={!selectedIndex || !query.trim() || loading}
            style={{
              background: 'var(--vscode-button-background)',
              color: 'var(--vscode-button-foreground)',
              border: 'none',
              padding: '6px 14px',
              borderRadius: '2px',
              cursor: (!selectedIndex || !query.trim() || loading) ? 'not-allowed' : 'pointer',
              fontSize: '13px',
              opacity: (!selectedIndex || !query.trim() || loading) ? 0.5 : 1,
            }}
          >
            {loading ? 'Running…' : 'Run Query ↵'}
          </button>
          {results !== null && !error && (
            <span style={{ opacity: 0.6, fontSize: '12px' }}>
              {total} result{total !== 1 ? 's' : ''}, {tookMs}ms
            </span>
          )}
        </div>
      </div>

      <div style={{
        flex: 1,
        overflow: 'auto',
        borderTop: '1px solid var(--vscode-input-border)',
        padding: '8px 12px',
      }}>
        {error && (
          <div style={{
            color: 'var(--vscode-errorForeground)',
            padding: '8px',
            border: '1px solid var(--vscode-errorForeground)',
            borderRadius: '2px',
            marginBottom: '8px',
          }}>
            {error}
          </div>
        )}
        {results !== null && !error && (
          <ResultsTable
            results={results}
            total={total}
            tookMs={tookMs}
            onKeyClick={handleKeyClick}
          />
        )}
        {results === null && !error && (
          <div style={{ textAlign: 'center', padding: '32px', opacity: 0.4 }}>
            Enter a query and press Run Query or Ctrl+Enter
          </div>
        )}
      </div>
    </div>
  );
};
