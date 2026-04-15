import styles from '../styles.module.css';
import { SearchResult } from '../../../shared/types';

interface Props {
  total: number;
  hits: SearchResult[];
  tookMs: number;
  error: string | null;
  onOpenKey: (key: string) => void;
}

export function ResultsTable({ total, hits, tookMs, error, onOpenKey }: Props) {
  if (error) {
    return <div className={styles.banner} role="alert">Error: {error}</div>;
  }

  const fieldNames = Array.from(
    hits.reduce<Set<string>>((acc, h) => {
      Object.keys(h.fields).forEach((k) => acc.add(k));
      return acc;
    }, new Set())
  );

  return (
    <div className={styles.results}>
      <div className={styles.resultsHeader}>
        <span>{total} match{total === 1 ? '' : 'es'}</span>
        <span className={styles.resultsMeta}>{tookMs}ms · showing {hits.length}</span>
      </div>
      {hits.length === 0 ? (
        <div className={styles.emptyHint}>No results.</div>
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Key</th>
                {fieldNames.map((f) => <th key={f}>{f}</th>)}
              </tr>
            </thead>
            <tbody>
              {hits.map((h) => (
                <tr key={h.key}>
                  <td>
                    <button
                      type="button"
                      className={styles.keyLink}
                      onClick={() => onOpenKey(h.key)}
                    >{h.key}</button>
                  </td>
                  {fieldNames.map((f) => <td key={f}>{h.fields[f] ?? ''}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
