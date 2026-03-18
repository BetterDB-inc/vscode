import React, { useState, useEffect } from 'react';
import { useVsCode } from './VsCodeContext';
import { KeyData, StringValue, HashValue, ListValue, SetValue, ZSetValue, StreamValue, JsonValue } from './types';
import { StringEditor, HashEditor, ListEditor, SetEditor, ZSetEditor, StreamViewer, JsonEditor, JsonTypeEditor } from './components';
import { valueToJson, jsonToValue } from './utils/typeConverters';
import styles from './styles.module.css';

interface AppProps {
  initialData: KeyData;
}

export const App: React.FC<AppProps> = ({ initialData }) => {
  const vscode = useVsCode();
  const [data, setData] = useState<KeyData>(initialData);
  const [dirty, setDirty] = useState(false);
  const [jsonEditMode, setJsonEditMode] = useState(false);
  const [jsonValue, setJsonValue] = useState('');
  const [jsonError, setJsonError] = useState<string | null>(null);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const message = event.data;
      if (message.command === 'update') {
        setData(message.data);
        setDirty(false);
        setJsonEditMode(false);
        setJsonValue('');
        setJsonError(null);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const handleSave = () => {
    const saveValue = getValueForSave();
    if (saveValue === null) {
      // Conversion failed - error is already shown via jsonError state
      return;
    }
    vscode.postMessage({ command: 'save', type: data.type, value: saveValue });
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

  const getValueForSave = (): unknown => {
    // If in JSON edit mode for complex types, convert back to native format
    if (jsonEditMode && ['hash', 'list', 'set', 'zset'].includes(data.value.type)) {
      const result = jsonToValue(data.value.type, jsonValue);
      if (!result.success) {
        setJsonError(result.error || 'Invalid JSON format');
        return null;
      }
      return result.data;
    }

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
      case 'json':
        return (data.value as JsonValue).value;
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
        case 'json':
          updated.value = { ...prev.value, value: newValue as string };
          break;
      }
      return updated;
    });
  };

  const handleJsonModeToggle = (enabled: boolean) => {
    if (enabled) {
      // Convert current value to JSON
      const json = valueToJson(data.value.type, data.value);
      setJsonValue(json);
      setJsonError(null);
    }
    setJsonEditMode(enabled);
  };

  const handleJsonChange = (value: string) => {
    setJsonValue(value);
    setDirty(true);
    // Validate the JSON against the expected type
    const result = jsonToValue(data.value.type, value);
    setJsonError(result.success ? null : (result.error || 'Invalid JSON'));
  };

  const renderEditor = () => {
    // Render JSON editor for JSON edit mode on complex types
    if (jsonEditMode && ['hash', 'list', 'set', 'zset'].includes(data.value.type)) {
      return (
        <div className={styles.jsonTypeEditor}>
          <label className={styles.label}>Value (JSON)</label>
          <JsonEditor
            value={jsonValue}
            onChange={handleJsonChange}
            height="400px"
          />
          {jsonError && (
            <div className={styles.validationError}>{jsonError}</div>
          )}
        </div>
      );
    }

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
            ftSchema={data.ftSchema}
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
      case 'json':
        return (
          <JsonTypeEditor
            value={(data.value as JsonValue).value}
            onChange={updateValue}
            onValidationError={setJsonError}
            validationError={jsonError}
          />
        );
      default:
        return <div className={styles.emptyState}>Unsupported type</div>;
    }
  };

  const isReadOnly = data.value.type === 'stream';
  const supportsJsonToggle = ['hash', 'list', 'set', 'zset'].includes(data.value.type);
  const canSave = !isReadOnly && dirty && !(jsonEditMode && jsonError !== null);

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
            disabled={!canSave}
          >
            Save Changes
          </button>
        )}
        <button className={styles.btn} onClick={handleRefresh}>Refresh</button>
        <button className={`${styles.btn} ${styles.danger}`} onClick={handleDelete}>Delete Key</button>
        {supportsJsonToggle && (
          <div className={styles.viewToggle}>
            <button
              className={`${styles.toggleBtn} ${!jsonEditMode ? styles.active : ''}`}
              onClick={() => handleJsonModeToggle(false)}
            >
              Table
            </button>
            <button
              className={`${styles.toggleBtn} ${jsonEditMode ? styles.active : ''}`}
              onClick={() => handleJsonModeToggle(true)}
            >
              JSON
            </button>
          </div>
        )}
      </div>

      {renderEditor()}
    </div>
  );
};
