import { useState } from 'react';
import styles from '../styles.module.css';
import { TagValue } from '../../../shared/types';

interface Props {
  value: TagValue;
  options: string[];
  onChange: (v: TagValue) => void;
}

export function TagField({ value, options, onChange }: Props) {
  const [draft, setDraft] = useState('');
  const remaining = options.filter((o) => !value.selected.includes(o));

  const add = (val: string) => {
    if (!val || value.selected.includes(val)) return;
    onChange({ selected: [...value.selected, val] });
    setDraft('');
  };
  const remove = (val: string) => onChange({ selected: value.selected.filter((s) => s !== val) });

  return (
    <div>
      {value.selected.map((v) => (
        <span key={v} className={styles.chip}>
          {v}
          <span className={styles.chipRemove} onClick={() => remove(v)}>✕</span>
        </span>
      ))}
      <input
        className={styles.input}
        list="tag-options"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(draft); } }}
        placeholder="Add value…"
      />
      <datalist id="tag-options">
        {remaining.map((o) => <option key={o} value={o} />)}
      </datalist>
    </div>
  );
}
