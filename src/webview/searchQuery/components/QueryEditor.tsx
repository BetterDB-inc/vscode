import React, { useRef, useEffect, useState } from 'react';
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
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const [theme, setTheme] = useState(getMonacoTheme());

  useEffect(() => { onRunRef.current = onRun; }, [onRun]);

  useEffect(() => {
    const observer = new MutationObserver(() => {
      const next = getMonacoTheme();
      setTheme(next);
      monaco.editor.setTheme(next);
    });
    observer.observe(document.body, { attributes: true, attributeFilter: ['data-vscode-theme-kind', 'class'] });
    return () => observer.disconnect();
  }, []);

  const handleMount: OnMount = (editor, monacoInstance) => {
    editorRef.current = editor;
    monacoInstance.editor.setTheme(getMonacoTheme());
    editor.addCommand(
      monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter,
      () => onRunRef.current()
    );
  };

  return (
    <div style={{
      height: 'clamp(120px, 33vh, 500px)',
      border: '1px solid var(--vscode-input-border)',
      borderRadius: '2px',
      overflow: 'hidden',
      opacity: disabled ? 0.6 : 1,
    }}>
      <MonacoEditor
        height="100%"
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
        }}
        theme={theme}
      />
    </div>
  );
};
