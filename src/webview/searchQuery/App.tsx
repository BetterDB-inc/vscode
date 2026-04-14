import React, { useEffect, useRef, useState } from 'react';
import { FtIndexInfo } from '../../shared/types';
import { ExtensionMessage, InitialData, SearchResult } from './types';
import { useVsCode } from './VsCodeContext';
import { IndexSelector } from './components/IndexSelector';
import { QueryEditor } from './components/QueryEditor';
import { ResultsTable } from './components/ResultsTable';
import { QueryHistory } from './components/QueryHistory';
import styles from './styles.module.css';

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
    if (!selectedIndex || !query.trim() || loading || !connected) {
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
    <div className={styles.container}>
      {!connected && (
        <div className={styles.connectionLost}>Connection lost</div>
      )}

      <div className={styles.toolbar}>
        <div className={styles.toolbarRow}>
          <span className={styles.indexLabel}>Index:</span>
          <IndexSelector indexes={indexes} selected={selectedIndex} onChange={setSelectedIndex} />
          <QueryHistory history={history} onSelect={handleHistorySelect} />
          <button
            className={styles.runBtn}
            onClick={runQuery}
            disabled={!selectedIndex || !query.trim() || loading || !connected}
          >
            {loading ? 'Running…' : 'Run Query ↵'}
          </button>
          {results !== null && !error && (
            <span className={styles.resultsMeta}>
              {total} result{total !== 1 ? 's' : ''}, {tookMs}ms
            </span>
          )}
        </div>
      </div>

      <QueryEditor
        value={query}
        onChange={setQuery}
        onRun={runQuery}
        disabled={loading || !connected}
      />

      <div className={styles.resultsArea}>
        {error && <div className={styles.errorBox}>{error}</div>}
        {results !== null && !error && (
          <ResultsTable
            results={results}
            total={total}
            tookMs={tookMs}
            onKeyClick={handleKeyClick}
          />
        )}
        {results === null && !error && (
          <div className={styles.placeholder}>
            Enter a query and press Run Query or Ctrl+Enter
          </div>
        )}
      </div>
    </div>
  );
};
