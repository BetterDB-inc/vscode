import styles from '../styles.module.css';
import { TextValue } from '../../../shared/types';

interface Props { value: TextValue; onChange: (v: TextValue) => void; }

export function TextField({ value, onChange }: Props) {
  return (
    <input
      className={styles.input}
      type="text"
      value={value.term}
      onChange={(e) => onChange({ term: e.target.value })}
      placeholder='term, "exact phrase", or -negation'
    />
  );
}
