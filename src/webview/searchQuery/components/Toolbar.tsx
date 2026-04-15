import { useEffect, useState } from 'react';
import styles from '../styles.module.css';

interface Props {
  commandLine: string;
  disabled: boolean;
  onExecute: () => void;
  onSendToCli: () => void;
  ack: { action: 'execute' | 'send'; ok: boolean; error?: string } | null;
}

export function Toolbar({ commandLine, disabled, onExecute, onSendToCli, ack }: Props) {
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!ack) return;
    if (ack.ok) {
      setToast(ack.action === 'execute' ? 'Executing in CLI ↗' : 'Sent to CLI ↗');
      const t = setTimeout(() => setToast(null), 1800);
      return () => clearTimeout(t);
    }
  }, [ack]);

  const empty = commandLine.trim().length === 0;

  return (
    <div className={styles.toolbar}>
      <button className={styles.btnPrimary} disabled={disabled || empty} onClick={onExecute}>
        Execute
      </button>
      <button className={styles.btnSecondary} disabled={disabled || empty} onClick={onSendToCli}>
        Send to CLI
      </button>
      <button className={styles.btnGhost} disabled={empty} onClick={() => navigator.clipboard.writeText(commandLine)}>
        Copy
      </button>
      {toast && <span className={styles.toast}>{toast}</span>}
      {ack && !ack.ok && <span className={styles.errorInline}>{ack.error ?? 'Failed'}</span>}
    </div>
  );
}
