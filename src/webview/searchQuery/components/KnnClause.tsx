import { useState } from 'react';
import styles from '../styles.module.css';
import type { IndexField, KnnClauseState, VectorSource } from '../../../shared/types';

interface Props {
  state: KnnClauseState;
  vectorField: IndexField;
  onChange: (next: KnnClauseState) => void;
  onPickKey: () => void;
}

type SourceKind = 'key' | 'paste';

function kindOf(source: VectorSource | undefined): SourceKind {
  if (source?.kind === 'paste') return 'paste';
  return 'key';
}

export function KnnClause({ state, vectorField, onChange, onPickKey }: Props) {
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const sourceKind = kindOf(state.source);
  const isHnsw = vectorField.vectorAlgorithm === 'HNSW';
  const pickedKey = state.source?.kind === 'key' ? state.source.key : undefined;

  return (
    <section className={styles.knnClause}>
      <p className={styles.knnHeader}>KNN clause</p>
      <div className={styles.knnRow}>
        <span>Field: <code>@{vectorField.name}</code></span>
        <label>
          K:
          <input
            className={styles.input}
            type="number"
            min={1}
            max={10000}
            value={state.k}
            onChange={(e) => onChange({ ...state, k: Number(e.target.value) || 1 })}
          />
        </label>
      </div>
      <div className={styles.knnRow}>
        <label>
          <input
            type="radio"
            name="knn-source"
            checked={sourceKind === 'key'}
            onChange={() => onChange({ ...state, source: undefined, pasteRaw: undefined, pasteError: undefined })}
          />
          {' '}Existing key
        </label>
        <label>
          <input
            type="radio"
            name="knn-source"
            checked={sourceKind === 'paste'}
            onChange={() => onChange({ ...state, source: { kind: 'paste', bytes: '' }, pasteRaw: '' })}
          />
          {' '}Paste
        </label>
      </div>
      {sourceKind === 'key' && (
        <div className={styles.knnRow}>
          <button className={styles.btnSecondary} type="button" onClick={onPickKey}>Pick key…</button>
          {pickedKey && (
            <span className={styles.knnPickedLabel}>from <code>{pickedKey}</code></span>
          )}
        </div>
      )}
      {sourceKind === 'paste' && (
        <div className={styles.knnRow}>
          <textarea
            className={styles.knnTextarea}
            placeholder="Paste base64 bytes, or a JSON array of floats…"
            value={state.pasteRaw ?? ''}
            onChange={(e) => onChange({ ...state, pasteRaw: e.target.value })}
          />
          {state.pasteError && (
            <div className={styles.knnError}>{state.pasteError}</div>
          )}
        </div>
      )}
      {isHnsw && (
        <details
          className={styles.knnAdvanced}
          open={advancedOpen}
          onToggle={(e) => setAdvancedOpen((e.target as HTMLDetailsElement).open)}
        >
          <summary>Advanced</summary>
          <label>
            EF_RUNTIME:
            <input
              className={styles.input}
              type="number"
              min={1}
              value={state.efRuntime ?? ''}
              onChange={(e) => onChange({
                ...state,
                efRuntime: e.target.value ? Number(e.target.value) : undefined,
              })}
            />
          </label>
        </details>
      )}
    </section>
  );
}
