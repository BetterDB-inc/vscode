import styles from '../styles.module.css';
import { SearchResult } from '../../../shared/types';

interface Props {
  total: number;
  hits: SearchResult[];
  tookMs: number;
  error: string | null;
  onOpenKey: (key: string) => void;
  isVectorQuery?: boolean;
  scoreField?: string;
  distanceMetric?: 'COSINE' | 'L2' | 'IP';
  vectorFieldName?: string;
}

function formatScore(raw: string | undefined): string {
  const n = Number(raw);
  return Number.isFinite(n) ? n.toFixed(4) : (raw ?? '');
}

function formatVectorCell(raw: string | undefined): string {
  if (raw === undefined || raw === null) return '';
  return `⟨${raw.length} bytes⟩`;
}

export function ResultsTable({ total, hits, tookMs, error, onOpenKey, isVectorQuery, scoreField, distanceMetric, vectorFieldName }: Props) {
  if (error) {
    return <div className={styles.banner} role="alert">Error: {error}</div>;
  }

  const showScore = Boolean(isVectorQuery && scoreField);

  const sortedHits = showScore && scoreField
    ? [...hits].sort((a, b) => {
        const na = Number(a.fields[scoreField]);
        const nb = Number(b.fields[scoreField]);
        const va = Number.isFinite(na) ? na : Number.POSITIVE_INFINITY;
        const vb = Number.isFinite(nb) ? nb : Number.POSITIVE_INFINITY;
        return va - vb;
      })
    : hits;

  const fieldNames = Array.from(
    sortedHits.reduce<Set<string>>((acc, h) => {
      Object.keys(h.fields).forEach((k) => acc.add(k));
      return acc;
    }, new Set())
  ).filter((f) => !showScore || f !== scoreField);

  const scoreHeader = `${distanceMetric ?? ''} distance ↑`.trim();

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
                {showScore && <th>{scoreHeader}</th>}
                <th>Key</th>
                {fieldNames.map((f) => <th key={f}>{f}</th>)}
              </tr>
            </thead>
            <tbody>
              {sortedHits.map((h) => (
                <tr key={h.key}>
                  {showScore && scoreField && <td>{formatScore(h.fields[scoreField])}</td>}
                  <td>
                    <button
                      type="button"
                      className={styles.keyLink}
                      onClick={() => onOpenKey(h.key)}
                    >{h.key}</button>
                  </td>
                  {fieldNames.map((f) => (
                    <td key={f} className={f === vectorFieldName ? styles.vectorCell : undefined}>
                      {f === vectorFieldName ? formatVectorCell(h.fields[f]) : (h.fields[f] ?? '')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
