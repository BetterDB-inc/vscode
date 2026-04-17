import styles from '../styles.module.css';

interface Props {
  value: string;
  onChange: (next: string, manual: boolean) => void;
  disabled?: boolean;
  isVectorPreview?: boolean;
}

export function CommandPreview({ value, onChange, disabled, isVectorPreview }: Props) {
  if (isVectorPreview) {
    return <pre className={styles.preview}>{value}</pre>;
  }
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
