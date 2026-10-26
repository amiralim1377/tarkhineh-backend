import { createElement } from 'react';
import { describe, expect, it } from 'vitest';
import { render } from 'react-email';

import { IdentityPasswordResetEmailView } from './identity-password-reset-email.view.js';

describe('IdentityPasswordResetEmailView', () => {
  const resetUrl =
    'https://frontend.example/reset-password?token=opaque-token_123&email=user%40example.com';

  const logoUrl = 'https://assets.example.test/tarkhineh-logo-white.png';

  const email = () =>
    createElement(IdentityPasswordResetEmailView, {
      resetUrl,
      logoUrl,
    });

  it('renders HTML with the reset link and branded content', async () => {
    const html = await render(email());

    expect(html).toContain('Reset your password');
    expect(html).toContain('Tarkhineh');
    expect(html).toContain('Reset password');

    expect(html).toContain(logoUrl);
    expect(html).toContain('ACCOUNT SECURITY');

    expect(html).toContain(
      'https://frontend.example/reset-password?token=opaque-token_123',
    );

    expect(html).toContain('If you did not request a password reset');

    expect(html).toContain(
      'This is an automated security email from Tarkhineh.',
    );

    expect(html).toMatch(/#417f56/i);
  });

  it('renders a plain-text version with the reset link', async () => {
    const text = await render(email(), {
      plainText: true,
    });

    expect(text).toMatch(/reset your password/i);
    expect(text).toContain(resetUrl);
    expect(text).toContain('Reset password');

    expect(text).toContain('If you did not request a password reset');

    expect(text).toContain(
      'This is an automated security email from Tarkhineh.',
    );
  });

  it('renders the fallback URL for users who cannot use the button', async () => {
    const html = await render(email());

    expect(html).toContain(
      'If the button does not work, copy the following link',
    );
    expect(html).toContain('opaque-token_123');
    expect(html).toContain('user%40example.com');
  });

  it('renders the security expiration notice', async () => {
    const html = await render(email());

    expect(html).toContain(
      'For your security, this link expires automatically.',
    );

    expect(html).toContain(
      'If it has expired, request a new password-reset email.',
    );
  });
});
