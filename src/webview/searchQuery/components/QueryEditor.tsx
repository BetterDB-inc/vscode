import React, { useRef, useEffect, useState, useCallback } from 'react';
import MonacoEditor, { loader, type OnMount } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import styles from '../styles.module.css';

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

function getBaseTheme(): 'vs' | 'vs-dark' | 'hc-black' {
  const kind = document.body.getAttribute('data-vscode-theme-kind');
  if (kind === 'vscode-light') return 'vs';
  if (kind === 'vscode-high-contrast') return 'hc-black';
  return 'vs-dark';
}

function getCssVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function applyVscodeTheme(): void {
  const bg = getCssVar('--vscode-editor-background') || '#1e1e1e';
  const fg = getCssVar('--vscode-editor-foreground') || '#d4d4d4';
  const lineHighlight = getCssVar('--vscode-editor-lineHighlightBackground') || bg;
  const selectionBg = getCssVar('--vscode-editor-selectionBackground') || '#264f78';

  monaco.editor.defineTheme('vscode-match', {
    base: getBaseTheme(),
    inherit: true,
    rules: [],
    colors: {
      'editor.background': bg,
      'editor.foreground': fg,
      'editor.lineHighlightBackground': lineHighlight,
      'editor.selectionBackground': selectionBg,
    },
  });
  monaco.editor.setTheme('vscode-match');
}

export const QueryEditor: React.FC<Props> = ({ value, onChange, onRun, disabled }) => {
  const onRunRef = useRef(onRun);
  const [ready, setReady] = useState(false);

  useEffect(() => { onRunRef.current = onRun; }, [onRun]);

  const handleMount: OnMount = useCallback((editor) => {
    applyVscodeTheme();
    setReady(true);

    editor.addCommand(
      monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter,
      () => onRunRef.current()
    );
  }, []);

  useEffect(() => {
    if (!ready) return;
    const observer = new MutationObserver(() => applyVscodeTheme());
    observer.observe(document.body, { attributes: true, attributeFilter: ['data-vscode-theme-kind', 'class'] });
    return () => observer.disconnect();
  }, [ready]);

  return (
    <div className={`${styles.editorWrap}${disabled ? ` ${styles.editorWrapDisabled}` : ''}`}>
      <MonacoEditor
        height="100%"
        language="plaintext"
        value={value}
        onChange={(val) => onChange(val ?? '')}
        onMount={handleMount}
        options={{
          minimap: { enabled: false },
          lineNumbers: 'on',
          scrollBeyondLastLine: false,
          wordWrap: 'on',
          readOnly: disabled,
          fontSize: 13,
          padding: { top: 6, bottom: 6 },
          overviewRulerLanes: 0,
          hideCursorInOverviewRuler: true,
          renderLineHighlight: 'none',
        }}
        theme="vscode-match"
      />
    </div>
  );
};
