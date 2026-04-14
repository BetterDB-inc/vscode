import React from 'react';
import { FtIndexInfo } from '../../../shared/types';

interface Props {
  indexes: FtIndexInfo[];
  selected: string | null;
  onChange: (name: string) => void;
}

export const IndexSelector: React.FC<Props> = ({ indexes, selected, onChange }) => {
  return (
    <select
      value={selected ?? ''}
      onChange={(e) => onChange(e.target.value)}
      style={{
        background: 'var(--vscode-input-background)',
        color: 'var(--vscode-editor-foreground)',
        border: '1px solid var(--vscode-input-border)',
        padding: '4px 8px',
        borderRadius: '2px',
        fontSize: '13px',
      }}
    >
      {!selected && <option value="" disabled>— Select Index —</option>}
      {indexes.map((idx) => (
        <option key={idx.name} value={idx.name}>
          {idx.name} ({idx.numDocs} docs)
        </option>
      ))}
    </select>
  );
};
