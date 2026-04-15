import styles from '../styles.module.css';
import { BuilderState, FieldFilter, IndexField, FtCommand } from '../../../shared/types';
import { TagField } from './TagField';
import { NumericField } from './NumericField';
import { TextField } from './TextField';
import { GeoField } from './GeoField';

interface Props {
  state: BuilderState;
  schema: IndexField[];
  tagValues: Record<string, string[]>;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onChange: (next: BuilderState) => void;
  onRequestTagValues: (field: string) => void;
}

export function QueryBuilder({ state, schema, tagValues, collapsed, onToggleCollapsed, onChange, onRequestTagValues }: Props) {
  if (collapsed) {
    return (
      <div className={styles.builderCollapsed} onClick={onToggleCollapsed}>
        ▶ Builder ({schema.length} fields)
      </div>
    );
  }

  const setField = (idx: number, patch: Partial<FieldFilter>) => {
    const fields = state.fields.map((f, i) => (i === idx ? { ...f, ...patch } : f));
    onChange({ ...state, fields, modified: false });
  };

  const setCommand = (cmd: FtCommand) => onChange({ ...state, command: cmd, modified: false });

  return (
    <div className={`${styles.builder} ${state.modified ? styles.builderModified : ''}`}>
      <div className={styles.header}>
        <span style={{ cursor: 'pointer' }} onClick={onToggleCollapsed}>▼ Builder</span>
        <select className={styles.select} value={state.command} onChange={(e) => setCommand(e.target.value as FtCommand)}>
          <option value="FT.SEARCH">FT.SEARCH</option>
          <option value="FT.AGGREGATE">FT.AGGREGATE</option>
          <option value="FT.INFO">FT.INFO</option>
        </select>
      </div>

      {state.command !== 'FT.INFO' && state.fields.map((field, idx) => (
        <div key={field.name} className={styles.field}>
          <input
            type="checkbox"
            checked={field.enabled}
            onChange={(e) => {
              setField(idx, { enabled: e.target.checked });
              if (e.target.checked && field.type === 'TAG' && !tagValues[field.name]) {
                onRequestTagValues(field.name);
              }
            }}
          />
          <span className={styles.fieldName}>
            {field.name}<span className={styles.fieldType}>{field.type}</span>
          </span>
          <FieldWidget
            field={field}
            tagOptions={tagValues[field.name] ?? []}
            onChange={(value) => setField(idx, { value })}
          />
        </div>
      ))}
    </div>
  );
}

function FieldWidget({ field, tagOptions, onChange }: { field: FieldFilter; tagOptions: string[]; onChange: (v: FieldFilter['value']) => void }) {
  switch (field.type) {
    case 'TAG': return <TagField value={field.value as any} options={tagOptions} onChange={onChange} />;
    case 'NUMERIC': return <NumericField value={field.value as any} onChange={onChange} />;
    case 'TEXT': return <TextField value={field.value as any} onChange={onChange} />;
    case 'GEO': return <GeoField value={field.value as any} onChange={onChange} />;
    case 'VECTOR': return <span style={{ opacity: 0.6 }}>VECTOR not supported in builder — type in preview</span>;
    default: return null;
  }
}
