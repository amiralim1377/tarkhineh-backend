import { createElement } from 'react';
import { describe, expect, it } from 'vitest';
import { render, Text } from 'react-email';

import { EmailLayout } from './email-layout.js';

describe('EmailLayout', () => {
  const logoUrl = 'https://assets.example.test/tarkhineh-logo-white.png';

  it('renders the shared layout and its email content', async () => {
    const html = await render(
      createElement(EmailLayout, {
        previewText: 'Reset your Tarkhineh password',
        logoUrl,
        footerMessage: 'Automated security email.',
        lang: 'en',
        dir: 'ltr',
        children: createElement(
          Text,
          null,
          'Your password reset instructions.',
        ),
      }),
    );

    expect(html).toContain('Reset your Tarkhineh password');
    expect(html).toContain(logoUrl);
    expect(html).toContain('Your password reset instructions.');
    expect(html).toContain('Automated security email.');
    expect(html).toMatch(/#417f56/i);
    expect(html).toMatch(/#ffffff/i);
    expect(html).toContain('lang="en"');
    expect(html).toContain('dir="ltr"');
  });

  it('defaults to Persian right-to-left layout', async () => {
    const html = await render(
      createElement(EmailLayout, {
        previewText: 'پیش‌نمایش ایمیل',
        logoUrl,
        children: createElement(Text, null, 'متن ایمیل'),
      }),
    );

    expect(html).toContain('lang="fa"');
    expect(html).toContain('dir="rtl"');
    expect(html).toContain('پیش‌نمایش ایمیل');
    expect(html).toContain('متن ایمیل');
    expect(html).toContain('This is an automated email from Tarkhineh.');
  });
});
