import React from 'react';
import styles from '../styles.module.css';

interface ListEditorProps {
  elements: string[];
  total: number;
  onChange: (elements: string[]) => void;
}

export const ListEditor: React.FC<ListEditorProps> = ({ elements, total, onChange }) => {
  const handleChange = (index: number, value: string) => {
    const updated = [...elements];
    updated[index] = value;
    onChange(updated);
  };

  const handleRemove = (index: number) => {
    onChange(elements.filter((_, i) => i !== index));
  };

  const handleAdd = () => {
    onChange([...elements, '']);
  };

  return (
    <div className={styles.dataSection}>
      {total > elements.length && (
        <p className={styles.info}>
          Total elements: {total} (showing first {elements.length})
        </p>
      )}

      <div className={`${styles.tableHeader} ${styles.listGrid}`}>
        <div className={styles.label}>Index</div>
        <div className={styles.label}>Value</div>
        <div></div>
      </div>

      {elements.length === 0 ? (
        <div className={styles.emptyState}>No elements in this list</div>
      ) : (
        elements.map((element, index) => (
          <div key={index} className={`${styles.tableRow} ${styles.listGrid}`}>
            <div className={styles.indexCell}>{index}</div>
            <input
              type="text"
              className={styles.input}
              value={element}
              onChange={(e) => handleChange(index, e.target.value)}
              placeholder="Enter value..."
            />
            <button
              type="button"
              className={styles.deleteBtn}
              onClick={() => handleRemove(index)}
              title="Remove element"
            >
              ×
            </button>
          </div>
        ))
      )}

      <div className={styles.addRow}>
        <button type="button" className={styles.addBtn} onClick={handleAdd}>
          + Add Element
        </button>
      </div>
    </div>
  );
};
