import React, { useEffect, useState } from 'react';
import * as monaco from 'monaco-editor';
import Editor, { loader, OnMount } from '@monaco-editor/react';
import styles from '../styles.module.css';

// Configure Monaco to use the bundled version instead of loading from CDN
// This ensures the extension works offline and doesn't require network access
loader.config({ monaco });

// Disable web workers - Monaco will work synchronously (sufficient for JSON editing)
// This avoids complex worker bundling and CSP issues in VS Code webviews
(self as unknown as { MonacoEnvironment: { getWorker: () => null } }).MonacoEnvironment = {
  getWorker: () => null,
};

interface JsonEditorProps {
  value: string;
  onChange: (value: string) => void;
  onValidationError?: (error: string | null) => void;
  readOnly?: boolean;
  height?: string;
}

export const JsonEditor: React.FC<JsonEditorProps> = ({
  value,
  onChange,
  onValidationError,
  readOnly = false,
  height = '400px',
}) => {
  const [theme, setTheme] = useState<'vs-dark' | 'light'>('vs-dark');

  useEffect(() => {
    const detectTheme = () => {
      const isDark = document.body.classList.contains('vscode-dark') ||
        document.body.getAttribute('data-vscode-theme-kind') === 'vscode-dark' ||
        window.matchMedia('(prefers-color-scheme: dark)').matches;
      setTheme(isDark ? 'vs-dark' : 'light');
    };

    detectTheme();

    const observer = new MutationObserver(detectTheme);
    observer.observe(document.body, { attributes: true, attributeFilter: ['class', 'data-vscode-theme-kind'] });

    return () => observer.disconnect();
  }, []);

  const handleEditorMount: OnMount = (editor, monaco) => {
    // Configure JSON validation
    monaco.languages.json.jsonDefaults.setDiagnosticsOptions({
      validate: true,
      allowComments: false,
      schemas: [],
      enableSchemaRequest: false,
    });

    // Format the document on mount
    setTimeout(() => {
      editor.getAction('editor.action.formatDocument')?.run();
    }, 100);

    // Listen for validation markers
    monaco.editor.onDidChangeMarkers((uris) => {
      const editorModel = editor.getModel();
      if (!editorModel) return;

      const editorUri = editorModel.uri.toString();
      const hasMarker = uris.some(uri => uri.toString() === editorUri);

      if (hasMarker && onValidationError) {
        const markers = monaco.editor.getModelMarkers({ resource: editorModel.uri });
        const errors = markers.filter(m => m.severity === monaco.MarkerSeverity.Error);
        if (errors.length > 0) {
          onValidationError(`Line ${errors[0].startLineNumber}: ${errors[0].message}`);
        } else {
          onValidationError(null);
        }
      } else if (onValidationError) {
        onValidationError(null);
      }
    });
  };

  const handleChange = (newValue: string | undefined) => {
    if (newValue !== undefined) {
      onChange(newValue);
    }
  };

  return (
    <div className={styles.jsonEditorContainer}>
      <div className={styles.monacoWrapper} style={{ height }}>
        <Editor
          defaultLanguage="json"
          value={value}
          onChange={handleChange}
          onMount={handleEditorMount}
          theme={theme}
          options={{
            readOnly,
            minimap: { enabled: false },
            lineNumbers: 'on',
            scrollBeyondLastLine: false,
            automaticLayout: true,
            tabSize: 2,
            fontSize: 13,
            fontFamily: "var(--vscode-editor-font-family, 'SF Mono', Monaco, Consolas, monospace)",
            wordWrap: 'on',
            folding: true,
            formatOnPaste: true,
            formatOnType: true,
          }}
          loading={<div className={styles.editorLoading}>Loading editor...</div>}
        />
      </div>
    </div>
  );
};
