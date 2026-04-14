import React, { useRef, useEffect, useCallback, useState } from 'react';
import MonacoEditor, { loader, type OnMount, type BeforeMount } from '@monaco-editor/react';
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

function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}

function getCssVarAsHex(name: string, fallback: string): string {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  if (!raw) return fallback;
  if (raw.startsWith('#')) return raw;
  const match = raw.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (match) return rgbToHex(+match[1], +match[2], +match[3]);
  return fallback;
}

function defineVscodeTheme(): void {
  const bg = getCssVarAsHex('--vscode-editor-background', '#1e1e1e');
  const fg = getCssVarAsHex('--vscode-editor-foreground', '#d4d4d4');
  const selectionBg = getCssVarAsHex('--vscode-editor-selectionBackground', '#264f78');

  monaco.editor.defineTheme('vscode-match', {
    base: getBaseTheme(),
    inherit: true,
    rules: [],
    colors: {
      'editor.background': bg,
      'editor.foreground': fg,
      'editor.selectionBackground': selectionBg,
    },
  });
}

defineVscodeTheme();

export const QueryEditor: React.FC<Props> = ({ value, onChange, onRun, disabled }) => {
  const onRunRef = useRef(onRun);
  const containerRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(200);

  useEffect(() => { onRunRef.current = onRun; }, [onRun]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setHeight(Math.floor(entry.contentRect.height));
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const observer = new MutationObserver(() => {
      defineVscodeTheme();
      monaco.editor.setTheme('vscode-match');
    });
    observer.observe(document.body, { attributes: true, attributeFilter: ['data-vscode-theme-kind', 'class'] });
    return () => observer.disconnect();
  }, []);

  const handleBeforeMount: BeforeMount = useCallback(() => {
    defineVscodeTheme();
  }, []);

  const handleMount: OnMount = useCallback((editor) => {
    monaco.editor.setTheme('vscode-match');
    editor.addCommand(
      monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter,
      () => onRunRef.current()
    );
  }, []);

  return (
    <div ref={containerRef} className={`${styles.editorWrap}${disabled ? ` ${styles.editorWrapDisabled}` : ''}`}>
      {height > 0 && (
        <MonacoEditor
          height={height}
          language="plaintext"
          value={value}
          onChange={(val) => onChange(val ?? '')}
          beforeMount={handleBeforeMount}
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
            automaticLayout: true,
          }}
          theme="vscode-match"
        />
      )}
    </div>
  );
};
