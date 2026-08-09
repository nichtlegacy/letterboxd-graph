import test from 'node:test';
import assert from 'node:assert/strict';

import { buildDonutSegments } from '../site/donut.js';

test('buildDonutSegments filters zero values and calculates percentages and offsets', () => {
  const segments = buildDonutSegments([
    { label: 'Current releases', value: 11 },
    { label: 'Older', value: 65 },
    { label: 'Other', value: 0 }
  ]);

  assert.equal(segments.length, 2);
  assert.equal(segments[0].total, 76);
  assert.equal(segments[0].percentage, (11 / 76) * 100);
  assert.equal(segments[0].offset, 0);
  assert.equal(segments[1].percentage, (65 / 76) * 100);
  assert.equal(segments[1].offset, (11 / 76) * 100);
});

test('buildDonutSegments preserves original color indexes after filtering', () => {
  const segments = buildDonutSegments([
    { label: 'Primary', value: 0 },
    { label: 'Secondary', value: 4 },
    { label: 'Other', value: 1 }
  ]);

  assert.deepEqual(segments.map(segment => segment.index), [1, 2]);
});

test('buildDonutSegments returns no segments without a positive total', () => {
  assert.deepEqual(buildDonutSegments([{ label: 'Empty', value: 0 }]), []);
});
