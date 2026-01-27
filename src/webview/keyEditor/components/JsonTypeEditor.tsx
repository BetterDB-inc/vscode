import React from 'react';
import { JsonEditor } from './JsonEditor';
import styles from '../styles.module.css';

interface JsonTypeEditorProps {
  value: string;
  onChange: (value: string) => void;
  onValidationError?: (error: string | null) => void;
  validationError?: string | null;
}

export const JsonTypeEditor: React.FC<JsonTypeEditorProps> = ({
  value,
  onChange,
  onValidationError,
  validationError,
}) => {
  return (
    <div className={styles.jsonTypeEditor}>
      <label className={styles.label}>Value</label>
      <JsonEditor
        value={value}
        onChange={onChange}
        onValidationError={onValidationError}
        height="400px"
      />
      {validationError && (
        <div className={styles.validationError}>{validationError}</div>
      )}
    </div>
  );
};
