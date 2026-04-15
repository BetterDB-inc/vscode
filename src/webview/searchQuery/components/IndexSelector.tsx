import React from 'react';
import styles from '../styles.module.css';

interface Props {
  indexes: string[];
  selected: string | null;
  onChange: (name: string) => void;
}

export const IndexSelector: React.FC<Props> = ({ indexes, selected, onChange }) => {
  if (indexes.length === 0) {
    return <span className={styles.emptyHint}>No indexes — create one with FT.CREATE.</span>;
  }
  return (
    <select
      className={styles.select}
      value={selected ?? ''}
      onChange={(e) => onChange(e.target.value)}
      aria-label="Search index"
    >
      {!selected && <option value="" disabled>— Select Index —</option>}
      {indexes.map((name) => (
        <option key={name} value={name}>{name}</option>
      ))}
    </select>
  );
};
