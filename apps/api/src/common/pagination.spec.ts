import { describe, expect, it } from 'vitest';
import { paginate } from './pagination.js';

describe('paginate', () => {
  it('returns empty items and null nextCursor for empty input', () => {
    const result = paginate([], 10);
    expect(result).toEqual({ items: [], nextCursor: null });
  });

  it('returns items and null nextCursor when rows count is less than limit', () => {
    const rows = [{ id: '1' }, { id: '2' }];
    const result = paginate(rows, 5);
    expect(result).toEqual({
      items: [{ id: '1' }, { id: '2' }],
      nextCursor: null,
    });
  });

  it('returns items and null nextCursor when rows count equals limit', () => {
    const rows = [{ id: '1' }, { id: '2' }, { id: '3' }];
    const result = paginate(rows, 3);
    expect(result).toEqual({
      items: [{ id: '1' }, { id: '2' }, { id: '3' }],
      nextCursor: null,
    });
  });

  it('slices items to limit and uses the last returned item id as nextCursor when rows count exceeds limit', () => {
    const rows = [{ id: '1' }, { id: '2' }, { id: '3' }];
    const result = paginate(rows, 2);
    expect(result).toEqual({
      items: [{ id: '1' }, { id: '2' }],
      nextCursor: '2',
    });
  });

  it('supports custom getCursor selector', () => {
    const rows = [
      { customKey: 'a', name: 'Item A' },
      { customKey: 'b', name: 'Item B' },
      { customKey: 'c', name: 'Item C' },
    ];
    const result = paginate(rows, 2, (item) => item.customKey);
    expect(result).toEqual({
      items: [
        { customKey: 'a', name: 'Item A' },
        { customKey: 'b', name: 'Item B' },
      ],
      nextCursor: 'b',
    });
  });

  it('enforces a minimum limit of 1', () => {
    const rows = [{ id: '1' }, { id: '2' }];
    const result = paginate(rows, 0);
    expect(result).toEqual({
      items: [{ id: '1' }],
      nextCursor: '1',
    });
  });
});
