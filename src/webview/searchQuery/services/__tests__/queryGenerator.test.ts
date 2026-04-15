import { describe, it, expect } from 'vitest';
import { generateCommand } from '../queryGenerator';
import { BuilderState } from '../../../../shared/types';

const baseState = (overrides: Partial<BuilderState> = {}): BuilderState => ({
  indexName: 'idx:users',
  command: 'FT.SEARCH',
  fields: [],
  modified: false,
  ...overrides,
});

describe('generateCommand', () => {
  it('produces match-all when no fields enabled', () => {
    expect(generateCommand(baseState())).toBe('FT.SEARCH idx:users *');
  });

  it('skips disabled fields', () => {
    const state = baseState({
      fields: [{ name: 'city', type: 'TAG', enabled: false, value: { selected: ['Portland'] } }],
    });
    expect(generateCommand(state)).toBe('FT.SEARCH idx:users *');
  });

  it('TAG field: OR-joins selected values', () => {
    const state = baseState({
      fields: [{ name: 'city', type: 'TAG', enabled: true, value: { selected: ['Portland', 'Seattle'] } }],
    });
    expect(generateCommand(state)).toBe('FT.SEARCH idx:users @city:{Portland|Seattle}');
  });

  it('NUMERIC between', () => {
    const state = baseState({
      fields: [{ name: 'age', type: 'NUMERIC', enabled: true, value: { operator: 'between', value1: 18, value2: 30 } }],
    });
    expect(generateCommand(state)).toBe('FT.SEARCH idx:users @age:[18 30]');
  });

  it('NUMERIC eq', () => {
    const state = baseState({
      fields: [{ name: 'age', type: 'NUMERIC', enabled: true, value: { operator: 'eq', value1: 25, value2: null } }],
    });
    expect(generateCommand(state)).toBe('FT.SEARCH idx:users @age:[25 25]');
  });

  it('NUMERIC gt uses exclusive lower bound', () => {
    const state = baseState({
      fields: [{ name: 'age', type: 'NUMERIC', enabled: true, value: { operator: 'gt', value1: 18, value2: null } }],
    });
    expect(generateCommand(state)).toBe('FT.SEARCH idx:users @age:[(18 +inf]');
  });

  it('NUMERIC gte', () => {
    const state = baseState({
      fields: [{ name: 'age', type: 'NUMERIC', enabled: true, value: { operator: 'gte', value1: 18, value2: null } }],
    });
    expect(generateCommand(state)).toBe('FT.SEARCH idx:users @age:[18 +inf]');
  });

  it('NUMERIC lt / lte', () => {
    const lt = baseState({
      fields: [{ name: 'age', type: 'NUMERIC', enabled: true, value: { operator: 'lt', value1: 65, value2: null } }],
    });
    expect(generateCommand(lt)).toBe('FT.SEARCH idx:users @age:[-inf (65]');
    const lte = baseState({
      fields: [{ name: 'age', type: 'NUMERIC', enabled: true, value: { operator: 'lte', value1: 65, value2: null } }],
    });
    expect(generateCommand(lte)).toBe('FT.SEARCH idx:users @age:[-inf 65]');
  });

  it('TEXT plain term', () => {
    const state = baseState({
      fields: [{ name: 'bio', type: 'TEXT', enabled: true, value: { term: 'engineer' } }],
    });
    expect(generateCommand(state)).toBe('FT.SEARCH idx:users @bio:engineer');
  });

  it('TEXT phrase with spaces is quoted', () => {
    const state = baseState({
      fields: [{ name: 'bio', type: 'TEXT', enabled: true, value: { term: 'senior engineer' } }],
    });
    expect(generateCommand(state)).toBe('FT.SEARCH idx:users @bio:"senior engineer"');
  });

  it('GEO field', () => {
    const state = baseState({
      fields: [{ name: 'loc', type: 'GEO', enabled: true, value: { lon: -122.4, lat: 45.5, radius: 50, unit: 'km' } }],
    });
    expect(generateCommand(state)).toBe('FT.SEARCH idx:users @loc:[-122.4 45.5 50 km]');
  });

  it('joins multiple enabled fields with implicit AND (space)', () => {
    const state = baseState({
      fields: [
        { name: 'city', type: 'TAG', enabled: true, value: { selected: ['Portland'] } },
        { name: 'age', type: 'NUMERIC', enabled: true, value: { operator: 'gte', value1: 18, value2: null } },
      ],
    });
    expect(generateCommand(state)).toBe('FT.SEARCH idx:users @city:{Portland} @age:[18 +inf]');
  });

  it('FT.AGGREGATE prefix', () => {
    const state = baseState({ command: 'FT.AGGREGATE' });
    expect(generateCommand(state)).toBe('FT.AGGREGATE idx:users *');
  });

  it('FT.INFO emits no query body', () => {
    const state = baseState({ command: 'FT.INFO' });
    expect(generateCommand(state)).toBe('FT.INFO idx:users');
  });

  it('skips fields with empty values', () => {
    const state = baseState({
      fields: [
        { name: 'city', type: 'TAG', enabled: true, value: { selected: [] } },
        { name: 'bio', type: 'TEXT', enabled: true, value: { term: '' } },
      ],
    });
    expect(generateCommand(state)).toBe('FT.SEARCH idx:users *');
  });
});
