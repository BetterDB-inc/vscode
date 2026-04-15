import styles from '../styles.module.css';
import { NumericValue, NumericOperator } from '../../../shared/types';

interface Props { value: NumericValue; onChange: (v: NumericValue) => void; }

const ops: { value: NumericOperator; label: string }[] = [
  { value: 'between', label: 'between' },
  { value: 'eq', label: '=' },
  { value: 'gt', label: '>' },
  { value: 'gte', label: '≥' },
  { value: 'lt', label: '<' },
  { value: 'lte', label: '≤' },
];

export function NumericField({ value, onChange }: Props) {
  const num = (s: string) => {
    if (s === '') return null;
    const n = Number(s);
    return isFinite(n) ? n : null;
  };
  return (
    <div>
      <select
        className={styles.select}
        value={value.operator}
        aria-label="Numeric operator"
        onChange={(e) => onChange({ ...value, operator: e.target.value as NumericOperator })}
      >
        {ops.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <input
        className={styles.input}
        type="number"
        aria-label={value.operator === 'between' ? 'Lower bound' : 'Value'}
        value={value.value1 ?? ''}
        onChange={(e) => onChange({ ...value, value1: num(e.target.value) })}
      />
      {value.operator === 'between' && (
        <input
          className={styles.input}
          type="number"
          aria-label="Upper bound"
          value={value.value2 ?? ''}
          onChange={(e) => onChange({ ...value, value2: num(e.target.value) })}
        />
      )}
    </div>
  );
}
