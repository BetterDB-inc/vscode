import { useEffect, useState } from 'react';
import styles from '../styles.module.css';

interface Props {
  commandLine: string;
  disabled: boolean;
  onExecute: () => void;
  onSendToCli: () => void;
  ack: { action: 'execute' | 'send'; ok: boolean; error?: string } | null;
  knnEnabled?: boolean;
  shellCommand?: string;
}

export function Toolbar({ commandLine, disabled, onExecute, onSendToCli, ack, knnEnabled, shellCommand }: Props) {
  const [toast, setToast] = useState<string | null>(null);

  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!ack) return;
    if (ack.ok) {
      setErrorMsg(null);
      setToast(ack.action === 'execute' ? 'Executing in CLI ↗' : 'Sent to CLI ↗');
      const t = setTimeout(() => setToast(null), 1800);
      return () => clearTimeout(t);
    }
    setErrorMsg(ack.error ?? 'Failed');
    const t = setTimeout(() => setErrorMsg(null), 4000);
    return () => clearTimeout(t);
  }, [ack]);

  const executeEmpty = commandLine.trim().length === 0;
  const copyText = knnEnabled ? (shellCommand ?? '') : commandLine;
  const copyEmpty = copyText.trim().length === 0;

  return (
    <div className={styles.toolbar}>
      <button className={styles.btnPrimary} disabled={disabled || executeEmpty} onClick={onExecute}>
        Execute
      </button>
      <button
        className={styles.btnSecondary}
        disabled={disabled || executeEmpty || knnEnabled}
        title={knnEnabled ? "Vector queries contain binary data and can't be sent to the interactive CLI. Use Copy to get a shell command you can run in your terminal." : undefined}
        onClick={onSendToCli}
      >
        Send to CLI
      </button>
      <button className={styles.btnGhost} disabled={copyEmpty} onClick={() => navigator.clipboard.writeText(copyText).catch(() => undefined)}>
        Copy
      </button>
      {toast && <span className={styles.toast}>{toast}</span>}
      {errorMsg && <span className={styles.errorInline} role="alert">{errorMsg}</span>}
    </div>
  );
}
