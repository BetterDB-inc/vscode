import { useId, useState } from 'react';
import styles from '../styles.module.css';
import { TagValue } from '../../../shared/types';

interface Props {
  value: TagValue;
  options: string[];
  onChange: (v: TagValue) => void;
}

export function TagField({ value, options, onChange }: Props) {
  const [draft, setDraft] = useState('');
  const listId = useId();
  const remaining = options.filter((o) => !value.selected.includes(o));

  const add = (val: string) => {
    const trimmed = val.trim();
    if (!trimmed || value.selected.includes(trimmed)) return;
    onChange({ selected: [...value.selected, trimmed] });
    setDraft('');
  };
  const remove = (val: string) => onChange({ selected: value.selected.filter((s) => s !== val) });

  return (
    <div>
      {value.selected.map((v) => (
        <span key={v} className={styles.chip}>
          {v}
          <button
            type="button"
            className={styles.chipRemove}
            onClick={() => remove(v)}
            aria-label={`Remove ${v}`}
          >✕</button>
        </span>
      ))}
      <input
        className={styles.input}
        list={listId}
        value={draft}
        onChange={(e) => {
          const next = e.target.value;
          setDraft(next);
          if (options.includes(next)) add(next);
        }}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(draft); } }}
        onBlur={() => { if (draft.trim()) add(draft); }}
        placeholder="Add value…"
        aria-label="Add tag value"
      />
      <datalist id={listId}>
        {remaining.map((o) => <option key={o} value={o} />)}
      </datalist>
    </div>
  );
}
