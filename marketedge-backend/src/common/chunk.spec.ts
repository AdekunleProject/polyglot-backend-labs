import { chunk } from './chunk';

describe('chunk', () => {
  it('splits a list into batches and keeps the remainder', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it('returns no batches for an empty list', () => {
    expect(chunk([], 3)).toEqual([]);
  });

  it('rejects a batch size below 1', () => {
    expect(() => chunk([1], 0)).toThrow('positive integer');
  });

  it('handles tens of thousands of items in the expected number of batches', () => {
    const items = Array.from({ length: 25_000 }, (_, i) => i);
    const batches = chunk(items, 1000);
    expect(batches).toHaveLength(25);
    expect(batches[24]).toHaveLength(1000);
  });
});
