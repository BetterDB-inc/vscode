import React from 'react';

interface Props {
  history: string[];
  onSelect: (query: string) => void;
}

export const QueryHistory: React.FC<Props> = ({ history, onSelect }) => {
  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    if (val) {
      onSelect(val);
      e.target.value = '';
    }
  };

  return (
    <select
      onChange={handleChange}
      defaultValue=""
      style={{
        background: 'var(--vscode-input-background)',
        color: 'var(--vscode-editor-foreground)',
        border: '1px solid var(--vscode-input-border)',
        padding: '4px 8px',
        borderRadius: '2px',
        fontSize: '13px',
      }}
    >
      <option value="" disabled>— History —</option>
      {history.length === 0
        ? <option value="" disabled>No history yet</option>
        : history.map((q, i) => (
          <option key={i} value={q}>
            {q.length > 60 ? q.slice(0, 60) + '…' : q}
          </option>
        ))
      }
    </select>
  );
};
