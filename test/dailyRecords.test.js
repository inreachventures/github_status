'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApi } = require('./support/mockFetch');

const TODAY = '2026-09-17';

function seed(api, days) {
  api.saveDailyRecords(days);
}

test('recordTier: no celebration until there is a previous best to chase', () => {
  const api = loadApi();
  assert.equal(api.recordTier(0, 0), null);
  assert.equal(api.recordTier(12, 0), null);
  assert.equal(api.recordTier(0, 12), null);
});

test('recordTier: record / tied / approaching thresholds', () => {
  const api = loadApi();
  assert.equal(api.recordTier(11, 10), 'record');
  assert.equal(api.recordTier(10, 10), 'tied');
  assert.equal(api.recordTier(9, 10), 'approaching');   // exactly 90%
  assert.equal(api.recordTier(8, 10), null);            // 80% — nothing to shout about
});

test('recordDailyPasses: today is excluded from the record it is chasing', () => {
  const api = loadApi();
  seed(api, { '2026-09-15': 8, '2026-09-16': 10 });

  const rec = api.recordDailyPasses(12, TODAY);
  assert.equal(rec.today, 12);
  assert.equal(rec.best, 10);
  assert.equal(rec.bestDay, '2026-09-16');
  assert.equal(rec.tier, 'record');

  // Re-running with the same day keeps reporting against the older best.
  assert.equal(api.recordDailyPasses(13, TODAY).best, 10);
});

test('recordDailyPasses: persists today and never lowers a stored count', () => {
  const api = loadApi();
  api.recordDailyPasses(7, TODAY);
  api.recordDailyPasses(4, TODAY);   // a shorter fetch window must not erase progress
  assert.equal(api.loadDailyRecords()[TODAY], 7);
});

test('recordDailyPasses: yesterday becomes the record to beat the next day', () => {
  const api = loadApi();
  api.recordDailyPasses(9, '2026-09-16');
  const rec = api.recordDailyPasses(9, TODAY);
  assert.equal(rec.tier, 'tied');
  assert.equal(rec.best, 9);
});

test('saveDailyRecords: keeps only the most recent 90 days', () => {
  const api = loadApi();
  const days = {};
  for (let i = 1; i <= 120; i++) days[`2026-01-${String(i).padStart(3, '0')}`] = i;
  const kept = Object.keys(api.saveDailyRecords(days));
  assert.equal(kept.length, 90);
  assert.equal(kept[0], '2026-01-031');
});

test('loadDailyRecords: survives corrupted storage', () => {
  const api = loadApi();
  localStorage.setItem('gh_daily_records', 'not json');
  assert.deepEqual(api.loadDailyRecords(), {});
});

test('dayKey: local-date key, zero padded', () => {
  const api = loadApi();
  assert.equal(api.dayKey(new Date(2026, 8, 7)), '2026-09-07');
});

test('allTimeRecord: the best day of the whole history, today included', () => {
  const api = loadApi();
  seed(api, { '2026-09-15': 8, '2026-09-16': 10, [TODAY]: 12 });
  assert.deepEqual(api.allTimeRecord(), { count: 12, day: TODAY });
});

test('allTimeRecord: ties go to the day that got there first', () => {
  const api = loadApi();
  seed(api, { '2026-09-16': 10, '2026-09-15': 10, '2026-09-14': 3 });
  assert.deepEqual(api.allTimeRecord(), { count: 10, day: '2026-09-15' });
});

test('allTimeRecord: empty history has no record to show', () => {
  const api = loadApi();
  assert.deepEqual(api.allTimeRecord(), { count: 0, day: null });
});

test('recordDailyPasses: reports the all-time high alongside the mark to beat', () => {
  const api = loadApi();
  seed(api, { '2026-09-16': 10 });

  // Today breaks it: it is the record from the moment it does, while `best`
  // stays on the older day today was chasing.
  const rec = api.recordDailyPasses(12, TODAY);
  assert.equal(rec.best, 10);
  assert.deepEqual(rec.allTime, { count: 12, day: TODAY });

  // A quieter day leaves the all-time high where it was.
  const quiet = api.recordDailyPasses(4, '2026-09-18');
  assert.deepEqual(quiet.allTime, { count: 12, day: TODAY });
});
