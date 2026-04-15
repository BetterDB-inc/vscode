import styles from '../styles.module.css';

interface Props {
  value: string;
  onChange: (next: string, manual: boolean) => void;
  disabled?: boolean;
}

export function CommandPreview({ value, onChange, disabled }: Props) {
  return (
    <textarea
      className={styles.preview}
      value={value}
      onChange={(e) => onChange(e.target.value, true)}
      spellCheck={false}
      disabled={disabled}
    />
  );
}
