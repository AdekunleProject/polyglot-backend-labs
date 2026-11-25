import { csvCell, toCsv } from './csv';

describe('csv', () => {
  it('quotes cells with commas, quotes and new lines', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('one\ntwo')).toBe('"one\ntwo"');
  });

  it('stops spreadsheet formulas', () => {
    expect(csvCell('=SUM(A1:A2)')).toBe("'=SUM(A1:A2)");
    expect(csvCell('@cmd')).toBe("'@cmd");
    expect(csvCell('+1')).toBe("'+1");
  });

  it('writes empty cells, numbers and dates', () => {
    expect(csvCell(null)).toBe('');
    expect(csvCell(0)).toBe('0');
    expect(csvCell(new Date('2026-01-02T03:04:05Z'))).toBe('2026-01-02T03:04:05.000Z');
  });

  it('builds a header and rows', () => {
    expect(toCsv(['a', 'b'], [{ a: 1, b: 'x,y' }])).toBe('a,b\n1,"x,y"\n');
  });
});
