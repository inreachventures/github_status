'use strict';

// Covers the "entries per card" setting: how many branches each repo card
// lists, stored in localStorage and edited from the settings panel.

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApi } = require('./support/mockFetch');

test('getEntriesPerCard: defaults to 5 when nothing is stored', () => {
  const { getEntriesPerCard } = loadApi();
  assert.equal(getEntriesPerCard(), 5);
});

test('setEntriesPerCard: stores the value and getEntriesPerCard reads it back', () => {
  const { getEntriesPerCard, setEntriesPerCard } = loadApi();
  assert.equal(setEntriesPerCard(12), 12);
  assert.equal(getEntriesPerCard(), 12);
  assert.equal(localStorage.getItem('gh_entries_per_card'), '12');
});

test('setEntriesPerCard: accepts the string an <input type="number"> gives', () => {
  const { getEntriesPerCard, setEntriesPerCard } = loadApi();
  setEntriesPerCard('7');
  assert.equal(getEntriesPerCard(), 7);
});

test('clampEntries: keeps values inside 1..50 and drops fractions', () => {
  const { clampEntries } = loadApi();
  assert.equal(clampEntries(0), 1);
  assert.equal(clampEntries(-3), 1);
  assert.equal(clampEntries(51), 50);
  assert.equal(clampEntries(500), 50);
  assert.equal(clampEntries('6.9'), 6);
});

test('clampEntries: empty or garbage input falls back to the default', () => {
  const { clampEntries } = loadApi();
  assert.equal(clampEntries(''), 5);
  assert.equal(clampEntries('abc'), 5);
  assert.equal(clampEntries(null), 5);
  assert.equal(clampEntries(undefined), 5);
});

test('getEntriesPerCard: a corrupted stored value falls back to the default', () => {
  const { getEntriesPerCard } = loadApi();
  localStorage.setItem('gh_entries_per_card', 'not-a-number');
  assert.equal(getEntriesPerCard(), 5);
});
