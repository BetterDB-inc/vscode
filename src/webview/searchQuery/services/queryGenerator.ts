import { BuilderState, FieldFilter, NumericValue, TagValue, TextValue, GeoValue } from '../../../shared/types';

export function generateCommand(state: BuilderState): string {
  if (state.command === 'FT.INFO') {
    return `FT.INFO ${state.indexName}`;
  }
  const clauses = state.fields
    .filter((f) => f.enabled && hasValue(f))
    .map((f) => clauseFor(f));
  const body = clauses.length === 0 ? '*' : clauses.join(' ');
  return `${state.command} ${state.indexName} ${body}`;
}

function hasValue(f: FieldFilter): boolean {
  switch (f.type) {
    case 'TAG': return (f.value as TagValue).selected.length > 0;
    case 'NUMERIC': {
      const v = f.value as NumericValue;
      if (v.operator === 'between') return v.value1 !== null && v.value2 !== null;
      return v.value1 !== null;
    }
    case 'TEXT': return (f.value as TextValue).term.trim().length > 0;
    case 'GEO': {
      const v = f.value as GeoValue;
      return v.lon !== null && v.lat !== null && v.radius !== null;
    }
    default: return false;
  }
}

function clauseFor(f: FieldFilter): string {
  switch (f.type) {
    case 'TAG': {
      const v = f.value as TagValue;
      return `@${f.name}:{${v.selected.join('|')}}`;
    }
    case 'NUMERIC': {
      const v = f.value as NumericValue;
      return `@${f.name}:${numericRange(v)}`;
    }
    case 'TEXT': {
      const term = (f.value as TextValue).term.trim();
      return /\s/.test(term) ? `@${f.name}:"${term}"` : `@${f.name}:${term}`;
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
