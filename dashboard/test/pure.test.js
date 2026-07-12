const test = require('node:test');
const assert = require('node:assert/strict');
const {
  worstStatus,
  jenkinsColorToStatus,
  sonarStatusToStatus,
  weatherCodeInfo,
  isSameLocalDay,
  pruneHistory,
  sumEnergyForDay,
  co2Grams,
} = require('../lib/pure');

test('worstStatus', async (t) => {
  await t.test('returns good when everything is good', () => {
    assert.equal(worstStatus(['good', 'good']), 'good');
  });
  await t.test('escalates to the worst status present', () => {
    assert.equal(worstStatus(['good', 'warning', 'good']), 'warning');
    assert.equal(worstStatus(['good', 'warning', 'critical']), 'critical');
    assert.equal(worstStatus(['warning', 'serious']), 'serious');
  });
  await t.test('empty list defaults to good', () => {
    assert.equal(worstStatus([]), 'good');
  });
});

test('jenkinsColorToStatus', async (t) => {
  await t.test('maps known colors', () => {
    assert.equal(jenkinsColorToStatus('blue'), 'good');
    assert.equal(jenkinsColorToStatus('yellow'), 'warning');
    assert.equal(jenkinsColorToStatus('red'), 'critical');
    assert.equal(jenkinsColorToStatus('aborted'), 'serious');
  });
  await t.test('strips the _anime suffix for a currently-building job', () => {
    assert.equal(jenkinsColorToStatus('blue_anime'), 'good');
    assert.equal(jenkinsColorToStatus('red_anime'), 'critical');
  });
  await t.test('unknown/missing color defaults to warning', () => {
    assert.equal(jenkinsColorToStatus('grey'), 'warning');
    assert.equal(jenkinsColorToStatus(null), 'warning');
    assert.equal(jenkinsColorToStatus(undefined), 'warning');
  });
});

test('sonarStatusToStatus', async (t) => {
  await t.test('maps known statuses', () => {
    assert.equal(sonarStatusToStatus('OK'), 'good');
    assert.equal(sonarStatusToStatus('WARN'), 'warning');
    assert.equal(sonarStatusToStatus('ERROR'), 'critical');
  });
  await t.test('unknown status defaults to warning', () => {
    assert.equal(sonarStatusToStatus('NONE'), 'warning');
    assert.equal(sonarStatusToStatus(undefined), 'warning');
  });
});

test('weatherCodeInfo', async (t) => {
  await t.test('returns [icon, label] for known WMO codes', () => {
    assert.deepEqual(weatherCodeInfo(0), ['☀️', 'Clear']);
    assert.deepEqual(weatherCodeInfo(95), ['⛈️', 'Thunderstorm']);
  });
  await t.test('falls back gracefully for unknown codes', () => {
    assert.deepEqual(weatherCodeInfo(9999), ['❓', 'Unknown']);
  });
});

test('isSameLocalDay', async (t) => {
  await t.test('true for two timestamps on the same calendar day', () => {
    const ref = new Date(2026, 5, 15, 9, 0, 0);
    const morning = new Date(2026, 5, 15, 0, 1, 0).getTime();
    const night = new Date(2026, 5, 15, 23, 59, 0).getTime();
    assert.equal(isSameLocalDay(morning, ref), true);
    assert.equal(isSameLocalDay(night, ref), true);
  });
  await t.test('false across a day boundary', () => {
    const ref = new Date(2026, 5, 15, 9, 0, 0);
    const nextDay = new Date(2026, 5, 16, 0, 0, 1).getTime();
    assert.equal(isSameLocalDay(nextDay, ref), false);
  });
});

test('pruneHistory', async (t) => {
  await t.test('drops entries older than the cutoff', () => {
    const history = [{ time: 100 }, { time: 200 }, { time: 300 }];
    assert.deepEqual(pruneHistory(history, 200), [{ time: 200 }, { time: 300 }]);
  });
  await t.test('keeps everything when cutoff predates all entries', () => {
    const history = [{ time: 100 }, { time: 200 }];
    assert.deepEqual(pruneHistory(history, 0), history);
  });
});

test('sumEnergyForDay', async (t) => {
  await t.test('sums only same-day entries', () => {
    const day = new Date(2026, 5, 15, 12, 0, 0);
    const history = [
      { time: new Date(2026, 5, 15, 1, 0, 0).getTime(), energyWhDelta: 10 },
      { time: new Date(2026, 5, 15, 2, 0, 0).getTime(), energyWhDelta: 15 },
      { time: new Date(2026, 5, 14, 23, 0, 0).getTime(), energyWhDelta: 1000 }, // yesterday, excluded
    ];
    assert.equal(sumEnergyForDay(history, day), 25);
  });
  await t.test('returns 0 for a day with no samples', () => {
    assert.equal(sumEnergyForDay([], new Date()), 0);
  });
});

test('co2Grams', async (t) => {
  await t.test('converts Wh + a gCO2/kWh factor to grams', () => {
    assert.equal(co2Grams(1000, 200), 200); // 1 kWh at 200 g/kWh
    assert.equal(co2Grams(500, 200), 100); // 0.5 kWh
  });
  await t.test('zero energy is zero emissions', () => {
    assert.equal(co2Grams(0, 200), 0);
  });
});
