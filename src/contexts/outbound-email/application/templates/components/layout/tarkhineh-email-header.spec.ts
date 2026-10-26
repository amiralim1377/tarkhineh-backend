import { createElement } from 'react';
import { describe, expect, it } from 'vitest';
import { render } from 'react-email';

import { TarkhinehEmailHeader } from './tarkhineh-email-header.js';

describe('TarkhinehEmailHeader', () => {
  const logoUrl = 'https://assets.example.test/tarkhineh-logo-white.png';

  it('renders the white brand logo on the primary brand background', async () => {
    const html = await render(createElement(TarkhinehEmailHeader, { logoUrl }));

    expect(html).toContain(`src="${logoUrl}"`);
    expect(html).toContain('ترخینه | رستوران‌های زنجیره‌ای');
    expect(html).toMatch(/#417f56/i);
    expect(html).toContain('150');
    expect(html).toContain('51');
  });
});
