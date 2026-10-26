import { createElement } from 'react';
import { describe, expect, it } from 'vitest';
import { render } from 'react-email';

import { TarkhinehEmailFooter } from './tarkhineh-email-footer.js';

describe('TarkhinehEmailFooter', () => {
  it('renders the default footer message', async () => {
    const html = await render(createElement(TarkhinehEmailFooter));

    expect(html).toContain('This is an automated email from Tarkhineh.');
    expect(html).toMatch(/#f9f9f9/i);
    expect(html).toMatch(/#757575/i);
  });

  it('renders a custom footer message', async () => {
    const message = 'This is an automated security email from Tarkhineh.';

    const html = await render(createElement(TarkhinehEmailFooter, { message }));

    expect(html).toContain(message);
    expect(html).not.toContain('This is an automated email from Tarkhineh.');
  });
});
