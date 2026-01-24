import React from 'react';
import styles from '../styles.module.css';

interface SetEditorProps {
  members: string[];
  total: number;
  onChange: (members: string[]) => void;
}

export const SetEditor: React.FC<SetEditorProps> = ({ members, total, onChange }) => {
  const handleChange = (index: number, value: string) => {
    const updated = [...members];
    updated[index] = value;
    onChange(updated);
  };

  const handleRemove = (index: number) => {
    onChange(members.filter((_, i) => i !== index));
  };

  const handleAdd = () => {
    onChange([...members, '']);
  };

  return (
    <div className={styles.dataSection}>
      {total > members.length && (
        <p className={styles.info}>
          Total members: {total} (showing first {members.length})
        </p>
      )}

      <div className={`${styles.tableHeader} ${styles.setGrid}`}>
        <div className={styles.label}>Member</div>
        <div></div>
      </div>

      {members.length === 0 ? (
        <div className={styles.emptyState}>No members in this set</div>
      ) : (
        members.map((member, index) => (
          <div key={index} className={`${styles.tableRow} ${styles.setGrid}`}>
            <input
              type="text"
              className={styles.input}
              value={member}
              onChange={(e) => handleChange(index, e.target.value)}
              placeholder="Enter member..."
            />
            <button
              type="button"
              className={styles.deleteBtn}
              onClick={() => handleRemove(index)}
              title="Remove member"
            >
              ×
            </button>
          </div>
        ))
      )}

      <div className={styles.addRow}>
        <button type="button" className={styles.addBtn} onClick={handleAdd}>
          + Add Member
        </button>
      </div>
    </div>
  );
};
