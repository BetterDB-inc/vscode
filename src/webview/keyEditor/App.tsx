import React, { useState, useEffect } from 'react';
import { useVsCode } from './VsCodeContext';
import { KeyData, StringValue, HashValue, ListValue, SetValue, ZSetValue, StreamValue } from './types';
import { StringEditor, HashEditor, ListEditor, SetEditor, ZSetEditor, StreamViewer } from './components';
import styles from './styles.module.css';

interface AppProps {
  initialData: KeyData;
}

export const App: React.FC<AppProps> = ({ initialData }) => {
  const vscode = useVsCode();
  const [data, setData] = useState<KeyData>(initialData);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = event.data;
      if (message.command === 'update') {
        setData(message.data);
        setDirty(false);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const handleSave = () => {
    vscode.postMessage({ command: 'save', type: data.type, value: getValueForSave() });
  };

  const handleDelete = () => {
    vscode.postMessage({ command: 'delete' });
  };

  const handleRefresh = () => {
    vscode.postMessage({ command: 'refresh' });
  };

  const handleEditTtl = () => {
    vscode.postMessage({ command: 'editTtl' });
  };

  const getValueForSave = () => {
    switch (data.value.type) {
      case 'string':
        return (data.value as StringValue).value;
      case 'hash':
        return (data.value as HashValue).fields;
      case 'list':
        return (data.value as ListValue).elements;
      case 'set':
        return (data.value as SetValue).members;
      case 'zset':
        return (data.value as ZSetValue).members;
      default:
        return null;
    }
  };

  const updateValue = (newValue: unknown) => {
    setDirty(true);
    setData(prev => {
      const updated = { ...prev };
      switch (prev.value.type) {
        case 'string':
          updated.value = { ...prev.value, value: newValue as string };
          break;
        case 'hash':
          updated.value = { ...prev.value, fields: newValue as HashValue['fields'] };
          break;
        case 'list':
          updated.value = { ...prev.value, elements: newValue as string[] };
          break;
        case 'set':
          updated.value = { ...prev.value, members: newValue as string[] };
          break;
        case 'zset':
          updated.value = { ...prev.value, members: newValue as ZSetValue['members'] };
          break;
      }
      return updated;
    });
  };

  const renderEditor = () => {
    switch (data.value.type) {
      case 'string':
        return (
          <StringEditor
            value={(data.value as StringValue).value}
            onChange={updateValue}
          />
        );
      case 'hash':
        return (
          <HashEditor
            fields={(data.value as HashValue).fields}
            total={(data.value as HashValue).total}
            onChange={updateValue}
          />
        );
      case 'list':
        return (
          <ListEditor
            elements={(data.value as ListValue).elements}
            total={(data.value as ListValue).total}
            onChange={updateValue}
          />
        );
      case 'set':
        return (
          <SetEditor
            members={(data.value as SetValue).members}
            total={(data.value as SetValue).total}
            onChange={updateValue}
          />
        );
      case 'zset':
        return (
          <ZSetEditor
            members={(data.value as ZSetValue).members}
            total={(data.value as ZSetValue).total}
            onChange={updateValue}
          />
        );
      case 'stream':
        return (
          <StreamViewer
            entries={(data.value as StreamValue).entries}
            length={(data.value as StreamValue).length}
          />
        );
      default:
        return <div className={styles.emptyState}>Unsupported type</div>;
    }
  };

  const isReadOnly = data.value.type === 'stream';

  const getItemCount = () => {
    switch (data.value.type) {
      case 'hash':
        return `${(data.value as HashValue).total} fields`;
      case 'list':
        return `${(data.value as ListValue).total} elements`;
      case 'set':
        return `${(data.value as SetValue).total} members`;
      case 'zset':
        return `${(data.value as ZSetValue).total} members`;
      case 'stream':
        return `${(data.value as StreamValue).length} entries`;
      default:
        return '';
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div className={styles.keyName}>
          <span className={styles.keyNameText}>{data.key}</span>
          <span className={styles.typeBadge}>{data.type}</span>
        </div>
        <div className={styles.meta}>
          TTL: {data.ttl === -1 ? 'No expiry' : `${data.ttl} seconds`}
          {data.value.type !== 'string' && ` · ${getItemCount()}`}
          <button className={styles.metaBtn} onClick={handleEditTtl}>Edit TTL</button>
        </div>
      </div>

      <div className={styles.actionBar}>
        {!isReadOnly && (
          <button
            className={`${styles.btn} ${styles.primary}`}
            onClick={handleSave}
            disabled={!dirty}
          >
            Save Changes
          </button>
        )}
        <button className={styles.btn} onClick={handleRefresh}>Refresh</button>
        <button className={`${styles.btn} ${styles.danger}`} onClick={handleDelete}>Delete Key</button>
      </div>

      {renderEditor()}
    </div>
  );
};
