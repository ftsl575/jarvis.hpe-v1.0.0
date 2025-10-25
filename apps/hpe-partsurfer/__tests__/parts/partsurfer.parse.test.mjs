import { describe, expect, test } from '@jest/globals';
import { parseSearch } from '../../src/parseSearch.js';

describe('parseSearch PartSurfer details table', () => {
  test('prefers Part Description row when available', () => {
    const html = `<!doctype html>
<html>
  <body>
    <table class="ps-details">
      <tr><th>Part Number</th><td>875545-001</td></tr>
      <tr><th>Part Description</th><td>Synergy Composer Module</td></tr>
      <tr><th>Category</th><td>Keyword: Infrastructure</td></tr>
    </table>
  </body>
</html>`;

    const result = parseSearch(html);

    expect(result.description).toBe('Synergy Composer Module');
    expect(result.category).toBe('Infrastructure');
    expect(result.notFound).toBe(false);
  });
});
