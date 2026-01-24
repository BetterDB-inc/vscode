import React from 'react';
import styles from '../styles.module.css';

interface ZSetMember {
  member: string;
  score: number;
}

interface ZSetEditorProps {
  members: ZSetMember[];
  total: number;
  onChange: (members: ZSetMember[]) => void;
}

export const ZSetEditor: React.FC<ZSetEditorProps> = ({ members, total, onChange }) => {
  const handleChange = (index: number, key: 'member' | 'score', value: string | number) => {
    const updated = [...members];
    if (key === 'score') {
      updated[index] = { ...updated[index], score: Number(value) || 0 };
    } else {
      updated[index] = { ...updated[index], member: String(value) };
    }
    onChange(updated);
  };

  const handleRemove = (index: number) => {
    onChange(members.filter((_, i) => i !== index));
  };

  const handleAdd = () => {
    onChange([...members, { member: '', score: 0 }]);
  };

  return (
    <div className={styles.dataSection}>
      {total > members.length && (
        <p className={styles.info}>
          Total members: {total} (showing first {members.length})
        </p>
      )}

      <div className={`${styles.tableHeader} ${styles.zsetGrid}`}>
        <div className={styles.label}>Score</div>
        <div className={styles.label}>Member</div>
        <div></div>
      </div>

      {members.length === 0 ? (
        <div className={styles.emptyState}>No members in this sorted set</div>
      ) : (
        members.map((item, index) => (
          <div key={index} className={`${styles.tableRow} ${styles.zsetGrid}`}>
            <input
              type="number"
              className={`${styles.input} ${styles.scoreInput}`}
              value={item.score}
              onChange={(e) => handleChange(index, 'score', e.target.value)}
              step="any"
            />
            <input
              type="text"
              className={styles.input}
              value={item.member}
              onChange={(e) => handleChange(index, 'member', e.target.value)}
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
