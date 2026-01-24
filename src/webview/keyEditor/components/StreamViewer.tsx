import React from 'react';
import styles from '../styles.module.css';

interface StreamEntry {
  id: string;
  fields: Record<string, string>;
}

interface StreamViewerProps {
  entries: StreamEntry[];
  length: number;
}

export const StreamViewer: React.FC<StreamViewerProps> = ({ entries, length }) => {
  return (
    <div className={styles.dataSection}>
      <p className={styles.info}>Stream length: {length}</p>

      <div className={`${styles.tableHeader} ${styles.streamGrid}`}>
        <div className={styles.label}>ID</div>
        <div className={styles.label}>Fields</div>
      </div>

      {entries.length === 0 ? (
        <div className={styles.emptyState}>No entries in this stream</div>
      ) : (
        entries.map((entry) => (
          <div key={entry.id} className={`${styles.tableRow} ${styles.streamGrid}`}>
            <div className={styles.streamId}>{entry.id}</div>
            <div className={styles.streamFields}>
              {JSON.stringify(entry.fields, null, 2)}
            </div>
          </div>
        ))
      )}

      <p className={styles.note}>Stream entries are read-only. Use CLI to add entries.</p>
    </div>
  );
};
