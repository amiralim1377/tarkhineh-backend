import { createElement } from 'react';
import { describe, expect, it } from 'vitest';
import { render } from 'react-email';

import { IdentityEmailVerificationEmailView } from './email-verification.view.js';

describe('IdentityEmailVerificationEmailView', () => {
  const verificationUrl =
    'https://api.example/auth/verify-email?token=opaque-token_123';

  const logoUrl = 'https://assets.example.test/tarkhineh-logo-white.png';

  const email = () =>
    createElement(IdentityEmailVerificationEmailView, {
      verificationUrl,
      logoUrl,
    });

  it('renders Persian RTL HTML with the verification link', async () => {
    const html = await render(email());

    expect(html).toContain('به ترخینه خوش آمدید');
    expect(html).toContain('تأیید نشانی ایمیل');
    expect(html).toContain(logoUrl);
    expect(html).toContain(verificationUrl);
    expect(html).toContain('<html dir="rtl" lang="fa">');
  });

  it('renders a Persian plain-text version', async () => {
    const text = await render(email(), {
      plainText: true,
    });

    expect(text).toContain('به ترخینه خوش آمدید');
    expect(text).toContain('تأیید نشانی ایمیل');
    expect(text).toContain(verificationUrl);
  });
});
