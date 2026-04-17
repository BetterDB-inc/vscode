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
  it('produces match-all when no fields have values', () => {
    expect(generateCommand(baseState())).toBe('FT.SEARCH idx:users *');
  });

  it('TAG field: OR-joins selected values', () => {
    const state = baseState({
      fields: [{ name: 'city', type: 'TAG', value: { selected: ['Portland', 'Seattle'] } }],
    });
    expect(generateCommand(state)).toBe('FT.SEARCH idx:users "@city:{Portland|Seattle}"');
  });

  it('NUMERIC between', () => {
    const state = baseState({
      fields: [{ name: 'age', type: 'NUMERIC', value: { operator: 'between', value1: 18, value2: 30 } }],
    });
    expect(generateCommand(state)).toBe('FT.SEARCH idx:users "@age:[18 30]"');
  });

  it('NUMERIC eq', () => {
    const state = baseState({
      fields: [{ name: 'age', type: 'NUMERIC', value: { operator: 'eq', value1: 25, value2: null } }],
    });
    expect(generateCommand(state)).toBe('FT.SEARCH idx:users "@age:[25 25]"');
  });

  it('NUMERIC gt uses exclusive lower bound', () => {
    const state = baseState({
      fields: [{ name: 'age', type: 'NUMERIC', value: { operator: 'gt', value1: 18, value2: null } }],
    });
    expect(generateCommand(state)).toBe('FT.SEARCH idx:users "@age:[(18 +inf]"');
  });

  it('NUMERIC gte', () => {
    const state = baseState({
      fields: [{ name: 'age', type: 'NUMERIC', value: { operator: 'gte', value1: 18, value2: null } }],
    });
    expect(generateCommand(state)).toBe('FT.SEARCH idx:users "@age:[18 +inf]"');
  });

  it('NUMERIC lt / lte', () => {
    const lt = baseState({
      fields: [{ name: 'age', type: 'NUMERIC', value: { operator: 'lt', value1: 65, value2: null } }],
    });
    expect(generateCommand(lt)).toBe('FT.SEARCH idx:users "@age:[-inf (65]"');
    const lte = baseState({
      fields: [{ name: 'age', type: 'NUMERIC', value: { operator: 'lte', value1: 65, value2: null } }],
    });
    expect(generateCommand(lte)).toBe('FT.SEARCH idx:users "@age:[-inf 65]"');
  });

  it('TEXT plain term', () => {
    const state = baseState({
      fields: [{ name: 'bio', type: 'TEXT', value: { term: 'engineer' } }],
    });
    expect(generateCommand(state)).toBe('FT.SEARCH idx:users "@bio:engineer"');
  });

  it('TEXT phrase with spaces is inner-quoted and outer-quoted', () => {
    const state = baseState({
      fields: [{ name: 'bio', type: 'TEXT', value: { term: 'senior engineer' } }],
    });
    expect(generateCommand(state)).toBe('FT.SEARCH idx:users "@bio:\\"senior engineer\\""');
  });

  it('GEO field', () => {
    const state = baseState({
      fields: [{ name: 'loc', type: 'GEO', value: { lon: -122.4, lat: 45.5, radius: 50, unit: 'km' } }],
    });
    expect(generateCommand(state)).toBe('FT.SEARCH idx:users "@loc:[-122.4 45.5 50 km]"');
  });

  it('joins multiple fields with implicit AND (space)', () => {
    const state = baseState({
      fields: [
        { name: 'city', type: 'TAG', value: { selected: ['Portland'] } },
        { name: 'age', type: 'NUMERIC', value: { operator: 'gte', value1: 18, value2: null } },
      ],
    });
    expect(generateCommand(state)).toBe('FT.SEARCH idx:users "@city:{Portland} @age:[18 +inf]"');
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
        { name: 'city', type: 'TAG', value: { selected: [] } },
        { name: 'bio', type: 'TEXT', value: { term: '' } },
      ],
    });
    expect(generateCommand(state)).toBe('FT.SEARCH idx:users *');
  });

  it('TAG escapes only parsing-critical chars (pipe, brace, comma, backslash, whitespace, quote)', () => {
    const state = baseState({
      fields: [{ name: 'city', type: 'TAG', value: { selected: ['San Francisco', 'a|b', 'first-class'] } }],
    });
    expect(generateCommand(state)).toBe('FT.SEARCH idx:users "@city:{San\\ Francisco|a\\|b|first-class}"');
  });

  it('TAG does not escape dots, @, hyphens in emails', () => {
    const state = baseState({
      fields: [{ name: 'email', type: 'TAG', value: { selected: ['garth.pouros@yahoo.com'] } }],
    });
    expect(generateCommand(state)).toBe('FT.SEARCH idx:users "@email:{garth.pouros@yahoo.com}"');
  });

  it('TEXT escapes embedded quotes and backslashes', () => {
    const state = baseState({
      fields: [{ name: 'bio', type: 'TEXT', value: { term: 'she said "hi"' } }],
    });
    expect(generateCommand(state)).toBe('FT.SEARCH idx:users "@bio:\\"she said \\\\"hi\\\\"\\""');
  });

  it('NUMERIC between with min > max is skipped', () => {
    const state = baseState({
      fields: [{ name: 'age', type: 'NUMERIC', value: { operator: 'between', value1: 30, value2: 18 } }],
    });
    expect(generateCommand(state)).toBe('FT.SEARCH idx:users *');
  });

  it('NUMERIC with NaN value is skipped', () => {
    const state = baseState({
      fields: [{ name: 'age', type: 'NUMERIC', value: { operator: 'eq', value1: NaN, value2: null } }],
    });
    expect(generateCommand(state)).toBe('FT.SEARCH idx:users *');
  });

  it('TEXT trailing wildcard emits bare prefix term', () => {
    const state = baseState({
      fields: [{ name: 'name', type: 'TEXT', value: { term: 'Pou*' } }],
    });
    expect(generateCommand(state)).toBe('FT.SEARCH idx:users "@name:Pou*"');
  });

  it('TEXT leading wildcard without WITHSUFFIXTRIE uses single-quoted verbatim', () => {
    const state = baseState({
      fields: [{ name: 'name', type: 'TEXT', value: { term: '*Pouros' } }],
    });
    expect(generateCommand(state)).toBe("FT.SEARCH idx:users \"@name:'*Pouros'\"");
  });

  it('TEXT leading wildcard with WITHSUFFIXTRIE flag uses w\'…\' canonical syntax', () => {
    const state = baseState({
      fields: [{ name: 'name', type: 'TEXT', value: { term: '*Pouros' }, flags: ['WITHSUFFIXTRIE'] }],
    });
    expect(generateCommand(state)).toBe("FT.SEARCH idx:users \"@name:w'*Pouros'\"");
  });

  it('TEXT infix wildcard uses single-quoted verbatim', () => {
    const state = baseState({
      fields: [{ name: 'bio', type: 'TEXT', value: { term: '*engin*' } }],
    });
    expect(generateCommand(state)).toBe("FT.SEARCH idx:users \"@bio:'*engin*'\"");
  });

  it('GEO with negative radius is skipped', () => {
    const state = baseState({
      fields: [{ name: 'loc', type: 'GEO', value: { lon: 0, lat: 0, radius: -5, unit: 'km' } }],
    });
    expect(generateCommand(state)).toBe('FT.SEARCH idx:users *');
  });
});
