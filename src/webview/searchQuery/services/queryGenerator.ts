import { BuilderState, FieldFilter, NumericValue, TagValue, TextValue, GeoValue } from '../../../shared/types';

const TAG_SPECIAL = /([,.<>{}[\]"':;!@#$%^&*()\-+=~|/\\ ?])/g;
const TEXT_SPECIAL = /([\\"])/g;

const escapeTag = (v: string): string => v.replace(TAG_SPECIAL, '\\$1');
const escapeText = (v: string): string => v.replace(TEXT_SPECIAL, '\\$1');

export function generateCommand(state: BuilderState): string {
  if (state.command === 'FT.INFO') {
    return `FT.INFO ${state.indexName}`;
  }
  const clauses = state.fields
    .filter((f) => hasValue(f))
    .map((f) => clauseFor(f));
  if (clauses.length === 0) {
    return `${state.command} ${state.indexName} *`;
  }
  const body = clauses.join(' ').replace(/"/g, '\\"');
  return `${state.command} ${state.indexName} "${body}"`;
}

function hasValue(f: FieldFilter): boolean {
  switch (f.type) {
    case 'TAG': {
      const v = f.value as TagValue;
      return v.selected.some((s) => s.length > 0);
    }
    case 'NUMERIC': {
      const v = f.value as NumericValue;
      if (!isFinite(v.value1 ?? NaN)) return false;
      if (v.operator === 'between') {
        if (!isFinite(v.value2 ?? NaN)) return false;
        return (v.value1 as number) <= (v.value2 as number);
      }
      return true;
    }
    case 'TEXT': return (f.value as TextValue).term.trim().length > 0;
    case 'GEO': {
      const v = f.value as GeoValue;
      return isFinite(v.lon ?? NaN) && isFinite(v.lat ?? NaN) && isFinite(v.radius ?? NaN) && (v.radius as number) >= 0;
    }
    default: return false;
  }
}

function clauseFor(f: FieldFilter): string {
  switch (f.type) {
    case 'TAG': {
      const v = f.value as TagValue;
      const escaped = v.selected.filter((s) => s.length > 0).map(escapeTag).join('|');
      return `@${f.name}:{${escaped}}`;
    }
    case 'NUMERIC': {
      const v = f.value as NumericValue;
      return `@${f.name}:${numericRange(v)}`;
    }
    case 'TEXT': {
      const term = (f.value as TextValue).term.trim();
      if (term.includes('*')) {
        const isTrailingOnly = /^[^*\s]+\*$/.test(term);
        if (isTrailingOnly) {
          return `@${f.name}:${term}`;
        }
        const inner = term.replace(/'/g, "\\'");
        const prefix = f.flags?.includes('WITHSUFFIXTRIE') ? "w'" : "'";
        return `@${f.name}:${prefix}${inner}'`;
      }
      const escaped = escapeText(term);
      return /\s/.test(term) ? `@${f.name}:"${escaped}"` : `@${f.name}:${escaped}`;
    }
    case 'GEO': {
      const v = f.value as GeoValue;
      return `@${f.name}:[${v.lon} ${v.lat} ${v.radius} ${v.unit}]`;
    }
    default: return '';
  }
}

function numericRange(v: NumericValue): string {
  switch (v.operator) {
    case 'between': return `[${v.value1} ${v.value2}]`;
    case 'eq': return `[${v.value1} ${v.value1}]`;
    case 'gt': return `[(${v.value1} +inf]`;
    case 'gte': return `[${v.value1} +inf]`;
    case 'lt': return `[-inf (${v.value1}]`;
    case 'lte': return `[-inf ${v.value1}]`;
  }
}
