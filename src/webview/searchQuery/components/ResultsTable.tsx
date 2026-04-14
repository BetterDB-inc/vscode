import React from 'react';
import { SearchResult } from '../types';
import styles from '../styles.module.css';

interface Props {
  results: SearchResult[];
  total: number;
  tookMs: number;
  onKeyClick: (key: string) => void;
}

export const ResultsTable: React.FC<Props> = ({ results, total, tookMs, onKeyClick }) => {
  if (results.length === 0) {
    return <div className={styles.noResults}>No results</div>;
  }

  const fieldNames = Array.from(
    new Set(results.flatMap((r) => Object.keys(r.fields)))
  );

  return (
    <div>
      <div className={styles.resultsSummary}>
        {total} result{total !== 1 ? 's' : ''} ({tookMs}ms)
      </div>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.th}>Key</th>
              {fieldNames.map((name) => (
                <th key={name} className={styles.th}>{name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {results.map((result, i) => (
              <tr key={result.key} className={i % 2 === 0 ? styles.trEven : styles.trOdd}>
                <td className={styles.td}>
                  <button className={styles.keyLink} onClick={() => onKeyClick(result.key)}>
                    {result.key}
                  </button>
                </td>
                {fieldNames.map((name) => (
                  <td key={name} className={styles.td}>{result.fields[name] ?? ''}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
