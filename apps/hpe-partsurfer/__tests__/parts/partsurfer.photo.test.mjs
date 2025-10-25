import { describe, expect, test } from '@jest/globals';
import { parsePhoto } from '../../src/parsePhoto.js';

describe('parsePhoto ShowPhoto.aspx handling', () => {
  test('uses document title as description when available', () => {
    const html = `<!doctype html>
<html>
  <head>
    <title>Cooling Fan Assembly</title>
  </head>
  <body>
    <figure>
      <img src="https://images.example.com/fan.jpg" alt="Cooling fan" />
    </figure>
  </body>
</html>`;

    const result = parsePhoto(html);

    expect(result.description).toBe('Cooling Fan Assembly');
    expect(result.imageUrl).toBe('https://images.example.com/fan.jpg');
  });

  test('falls back to caption text when title is missing', () => {
    const html = `<!doctype html>
<html>
  <body>
    <figure>
      <img src="https://images.example.com/controller.jpg" alt="Controller" />
      <figcaption>Array Controller Caption</figcaption>
    </figure>
  </body>
</html>`;

    const result = parsePhoto(html);

    expect(result.description).toBe('Array Controller Caption');
    expect(result.imageUrl).toBe('https://images.example.com/controller.jpg');
  });
});
