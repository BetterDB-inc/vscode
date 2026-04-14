import React from 'react';
import styles from '../styles.module.css';

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
    <select className={styles.select} onChange={handleChange} defaultValue="">
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
