const { determineMode, SEARCH_MODE, PHOTO_MODE } = require('../src/mode');

describe('determineMode', () => {
  it('prefers Search with Photo fallback for -001 parts', () => {
    const { modes, fallbackStatuses } = determineMode('511778-001');
    expect(modes).toEqual([SEARCH_MODE, PHOTO_MODE]);
    expect(fallbackStatuses.has('no_bom')).toBe(true);
    expect(fallbackStatuses.has('not_found')).toBe(true);
  });

  it('uses Search only for -B21 parts', () => {
    const { modes, fallbackStatuses } = determineMode('123456-B21');
    expect(modes).toEqual([SEARCH_MODE]);
    expect(fallbackStatuses.size).toBe(0);
  });

  it('uses Photo only for configured photo parts', () => {
    const { modes } = determineMode('AF573A');
    expect(modes).toEqual([PHOTO_MODE]);
  });

  it('defaults to Search then Photo for other parts with not_found fallback', () => {
    const { modes, fallbackStatuses } = determineMode('123456-003');
    expect(modes).toEqual([SEARCH_MODE, PHOTO_MODE]);
    expect(fallbackStatuses.has('not_found')).toBe(true);
    expect(fallbackStatuses.has('no_bom')).toBe(false);
  });
});
