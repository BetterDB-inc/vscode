import React from 'react';
import { SearchResult } from '../types';

interface Props {
  results: SearchResult[];
  total: number;
  tookMs: number;
  onKeyClick: (key: string) => void;
}

export const ResultsTable: React.FC<Props> = ({ results, total, tookMs, onKeyClick }) => {
  if (results.length === 0) {
    return (
      <div style={{
        textAlign: 'center',
        padding: '24px',
        color: 'var(--vscode-editor-foreground)',
        opacity: 0.6,
      }}>
        No results
      </div>
    );
  }

  const fieldNames = Array.from(
    new Set(results.flatMap((r) => Object.keys(r.fields)))
  );

  return (
    <div>
      <div style={{
        padding: '6px 0',
        fontSize: '12px',
        color: 'var(--vscode-editor-foreground)',
        opacity: 0.7,
      }}>
        {total} result{total !== 1 ? 's' : ''} ({tookMs}ms)
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: '13px',
          color: 'var(--vscode-editor-foreground)',
        }}>
          <thead>
            <tr>
              <th style={thStyle}>Key</th>
              {fieldNames.map((name) => (
                <th key={name} style={thStyle}>{name}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {results.map((result, i) => (
              <tr
                key={i}
                style={{ background: i % 2 === 0 ? 'transparent' : 'var(--vscode-list-hoverBackground)' }}
              >
                <td style={tdStyle}>
                  <button
                    onClick={() => onKeyClick(result.key)}
                    style={{
                      background: 'none',
                      border: 'none',
                      padding: 0,
                      cursor: 'pointer',
                      color: 'var(--vscode-textLink-foreground)',
                      fontSize: '13px',
                      textAlign: 'left',
                    }}
                  >
                    {result.key}
                  </button>
                </td>
                {fieldNames.map((name) => (
                  <td key={name} style={tdStyle}>{result.fields[name] ?? ''}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

const thStyle: React.CSSProperties = {
  textAlign: 'left',
  padding: '6px 8px',
  borderBottom: '1px solid var(--vscode-input-border)',
  fontWeight: 600,
  whiteSpace: 'nowrap',
};

const tdStyle: React.CSSProperties = {
  padding: '5px 8px',
  borderBottom: '1px solid var(--vscode-input-border)',
  verticalAlign: 'top',
  maxWidth: '300px',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};
