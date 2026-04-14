import React from 'react';
import { FtIndexInfo } from '../../../shared/types';
import styles from '../styles.module.css';

interface Props {
  indexes: FtIndexInfo[];
  selected: string | null;
  onChange: (name: string) => void;
}

export const IndexSelector: React.FC<Props> = ({ indexes, selected, onChange }) => {
  return (
    <select
      className={styles.select}
      value={selected ?? ''}
      onChange={(e) => onChange(e.target.value)}
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
