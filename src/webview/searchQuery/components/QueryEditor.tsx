import React, { useRef, useEffect } from 'react';
import MonacoEditor, { loader, type OnMount } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';

loader.config({ monaco });

(self as unknown as { MonacoEnvironment: { getWorker: () => null } }).MonacoEnvironment = {
  getWorker: () => null,
};

interface Props {
  value: string;
  onChange: (value: string) => void;
  onRun: () => void;
  disabled?: boolean;
}

function getMonacoTheme(): string {
  const kind = document.body.getAttribute('data-vscode-theme-kind');
  if (kind === 'vscode-light') return 'vs';
  if (kind === 'vscode-high-contrast') return 'hc-black';
  return 'vs-dark';
}

export const QueryEditor: React.FC<Props> = ({ value, onChange, onRun, disabled }) => {
  const onRunRef = useRef(onRun);
  useEffect(() => { onRunRef.current = onRun; }, [onRun]);

  const handleMount: OnMount = (editor) => {
    editor.addCommand(
      monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter,
      () => onRunRef.current()
    );
  };

  return (
    <div style={{
      border: '1px solid var(--vscode-input-border)',
      borderRadius: '2px',
      overflow: 'hidden',
      opacity: disabled ? 0.6 : 1,
    }}>
      <MonacoEditor
        height="80px"
        language="plaintext"
        value={value}
        onChange={(val) => onChange(val ?? '')}
        onMount={handleMount}
        options={{
          minimap: { enabled: false },
          lineNumbers: 'off',
          scrollBeyondLastLine: false,
          wordWrap: 'on',
          readOnly: disabled,
          fontSize: 13,
          padding: { top: 6, bottom: 6 },
          overviewRulerLanes: 0,
          hideCursorInOverviewRuler: true,
          renderLineHighlight: 'none',
          scrollbar: { vertical: 'hidden', horizontal: 'hidden' },
        }}
        theme={getMonacoTheme()}
      />
    </div>
  );
};
