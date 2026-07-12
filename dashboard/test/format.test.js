// public/js/format.js is a browser ES module (loaded via <script
// type="module"> - no build step); Node's test runner can still exercise it
// directly via dynamic import(), which works from a CommonJS test file.
const test = require('node:test');
const assert = require('node:assert/strict');

let format;
test.before(async () => {
  format = await import('../public/js/format.js');
});

test('formatBytes', async (t) => {
  await t.test('formats under 1024 MB as MB', () => {
    assert.equal(format.formatBytes(500 * 1024 * 1024), '500 MB');
  });
  await t.test('formats 1024+ MB as GB', () => {
    assert.equal(format.formatBytes(2048 * 1024 * 1024), '2.0 GB');
  });
  await t.test('zero/falsy bytes', () => {
    assert.equal(format.formatBytes(0), '0 MB');
    assert.equal(format.formatBytes(null), '0 MB');
  });
});

test('formatDuration', async (t) => {
  await t.test('under a minute shows seconds', () => {
    assert.equal(format.formatDuration(45000), '45s');
  });
  await t.test('over a minute shows minutes and seconds', () => {
    assert.equal(format.formatDuration(125000), '2m 5s');
  });
  await t.test('falsy ms', () => {
    assert.equal(format.formatDuration(0), '—');
    assert.equal(format.formatDuration(null), '—');
  });
});

test('formatAgo', async (t) => {
  await t.test('recent timestamp reads "just now"', () => {
    assert.equal(format.formatAgo(Date.now() - 10000), 'just now');
  });
  await t.test('minutes ago', () => {
    assert.equal(format.formatAgo(Date.now() - 5 * 60000), '5m ago');
  });
  await t.test('hours ago', () => {
    assert.equal(format.formatAgo(Date.now() - 3 * 3600000), '3h ago');
  });
  await t.test('days ago', () => {
    assert.equal(format.formatAgo(Date.now() - 3 * 86400000), '3d ago');
  });
  await t.test('falsy timestamp', () => {
    assert.equal(format.formatAgo(null), '—');
  });
});

test('formatUptime', async (t) => {
  await t.test('days and hours', () => {
    assert.equal(format.formatUptime(2 * 86400 + 3 * 3600), '2d 3h');
  });
  await t.test('hours and minutes', () => {
    assert.equal(format.formatUptime(3 * 3600 + 15 * 60), '3h 15m');
  });
  await t.test('minutes only', () => {
    assert.equal(format.formatUptime(15 * 60), '15m');
  });
  await t.test('missing value', () => {
    assert.equal(format.formatUptime(null), 'n/a');
  });
  await t.test('zero is a valid uptime, not missing', () => {
    assert.equal(format.formatUptime(0), '0m');
  });
});

test('pctStatus', async (t) => {
  await t.test('thresholds', () => {
    assert.equal(format.pctStatus(50), '');
    assert.equal(format.pctStatus(80), 'warning');
    assert.equal(format.pctStatus(95), 'critical');
  });
  await t.test('null is unknown, not an error', () => {
    assert.equal(format.pctStatus(null), '');
  });
});

test('tempStatus', async (t) => {
  await t.test('thresholds', () => {
    assert.equal(format.tempStatus(50), '');
    assert.equal(format.tempStatus(70), 'warning');
    assert.equal(format.tempStatus(80), 'critical');
  });
  await t.test('null is unknown, not an error', () => {
    assert.equal(format.tempStatus(null), '');
  });
});

test('formatCo2', async (t) => {
  await t.test('grams under 1000 stay grams', () => {
    assert.equal(format.formatCo2(500), '500 g');
  });
  await t.test('1000+ grams convert to kg', () => {
    assert.equal(format.formatCo2(2500), '2.50 kg');
  });
});

test('formatBuildResult', async (t) => {
  await t.test('title-cases the Jenkins result string', () => {
    assert.equal(format.formatBuildResult('SUCCESS'), 'Success');
    assert.equal(format.formatBuildResult('FAILURE'), 'Failure');
  });
  await t.test('falsy result (e.g. build never ran)', () => {
    assert.equal(format.formatBuildResult(null), null);
  });
});

test('formatMs', async (t) => {
  await t.test('formats as m:ss', () => {
    assert.equal(format.formatMs(65000), '1:05');
    assert.equal(format.formatMs(5000), '0:05');
  });
  await t.test('missing/non-finite value defaults to 0:00', () => {
    assert.equal(format.formatMs(null), '0:00');
    assert.equal(format.formatMs(Infinity), '0:00');
  });
});

test('worstStatus', async (t) => {
  await t.test('returns good when everything is good', () => {
    assert.equal(format.worstStatus(['good', 'good']), 'good');
  });
  await t.test('escalates to the worst status present', () => {
    assert.equal(format.worstStatus(['good', 'warning', 'good']), 'warning');
    assert.equal(format.worstStatus(['good', 'warning', 'critical']), 'critical');
    assert.equal(format.worstStatus(['warning', 'serious']), 'serious');
  });
  await t.test('empty list defaults to good', () => {
    assert.equal(format.worstStatus([]), 'good');
  });
});
