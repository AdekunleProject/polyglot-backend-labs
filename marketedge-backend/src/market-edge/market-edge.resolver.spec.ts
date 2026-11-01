import { vipScoreFilter } from './market-edge.resolver';

describe('vipScoreFilter', () => {
  const payload = { vipScoreUpdated: { customerId: 'CUS_1' } };
  it('delivers an update to the subscriber watching that customer', () => {
    expect(vipScoreFilter(payload, { customerId: 'CUS_1' })).toBe(true);
  });
  it('does not leak another customer\'s update', () => {
    expect(vipScoreFilter(payload, { customerId: 'CUS_2' })).toBe(false);
  });
});
