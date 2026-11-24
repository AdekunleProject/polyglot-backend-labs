import { rowsOf } from './messages.service';

describe('rowsOf', () => {
  it('unwraps the [rows, count] answer of an UPDATE ... RETURNING', () => {
    expect(rowsOf([[{ id: 1 }], 1])).toEqual([{ id: 1 }]);
    expect(rowsOf([[], 0])).toEqual([]);
  });
  it('leaves a plain list of rows alone', () => {
    expect(rowsOf([{ id: 1 }, { id: 2 }])).toEqual([{ id: 1 }, { id: 2 }]);
    expect(rowsOf([])).toEqual([]);
  });
});
