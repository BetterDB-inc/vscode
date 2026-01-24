import React from 'react';
import styles from '../styles.module.css';

interface HashField {
  field: string;
  value: string;
}

interface HashEditorProps {
  fields: HashField[];
  total: number;
  onChange: (fields: HashField[]) => void;
}

export const HashEditor: React.FC<HashEditorProps> = ({ fields, total, onChange }) => {
  const handleChange = (index: number, key: 'field' | 'value', value: string) => {
    const updated = [...fields];
    updated[index] = { ...updated[index], [key]: value };
    onChange(updated);
  };

  const handleRemove = (index: number) => {
    onChange(fields.filter((_, i) => i !== index));
  };

  const handleAdd = () => {
    onChange([...fields, { field: '', value: '' }]);
  };

  return (
    <div className={styles.dataSection}>
      {total > fields.length && (
        <p className={styles.info}>
          Total fields: {total} (showing first {fields.length})
        </p>
      )}

      <div className={`${styles.tableHeader} ${styles.hashGrid}`}>
        <div className={styles.label}>Field</div>
        <div className={styles.label}>Value</div>
        <div></div>
      </div>

      {fields.length === 0 ? (
        <div className={styles.emptyState}>No fields in this hash</div>
      ) : (
        fields.map((item, index) => (
          <div key={index} className={`${styles.tableRow} ${styles.hashGrid}`}>
            <input
              type="text"
              className={styles.input}
              value={item.field}
              onChange={(e) => handleChange(index, 'field', e.target.value)}
              placeholder="Field name"
            />
            <input
              type="text"
              className={styles.input}
              value={item.value}
              onChange={(e) => handleChange(index, 'value', e.target.value)}
              placeholder="Value"
            />
            <button
              type="button"
              className={styles.deleteBtn}
              onClick={() => handleRemove(index)}
              title="Remove field"
            >
              ×
            </button>
          </div>
        ))
      )}

      <div className={styles.addRow}>
        <button type="button" className={styles.addBtn} onClick={handleAdd}>
          + Add Field
        </button>
      </div>
    </div>
  );
};
