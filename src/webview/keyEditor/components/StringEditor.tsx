import React from 'react';
import styles from '../styles.module.css';

interface StringEditorProps {
  value: string;
  onChange: (value: string) => void;
}

export const StringEditor: React.FC<StringEditorProps> = ({ value, onChange }) => {
  return (
    <div className={styles.stringEditor}>
      <label className={styles.label}>Value</label>
      <textarea
        className={styles.textarea}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Enter value..."
      />
    </div>
  );
};
