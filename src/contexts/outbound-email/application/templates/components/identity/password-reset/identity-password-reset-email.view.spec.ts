import { createElement } from 'react';
import { describe, expect, it } from 'vitest';
import { render } from 'react-email';

import { IdentityPasswordResetEmailView } from './identity-password-reset-email.view.js';

describe('IdentityPasswordResetEmailView', () => {
  const resetUrl =
    'https://frontend.example/reset-password?token=opaque-token_123&email=user%40example.com';

  const email = () =>
    createElement(IdentityPasswordResetEmailView, { resetUrl });

  it('renders HTML with the reset link and branded content', async () => {
    const html = await render(email());

    expect(html).toContain('Reset your password');
    expect(html).toContain('Tarkhineh');
    expect(html).toContain('Reset password');
    expect(html).toContain(
      'https://frontend.example/reset-password?token=opaque-token_123',
    );
    expect(html).toContain('If you did not request a password reset');
  });

  it('renders a plain-text version with the reset link', async () => {
    const text = await render(email(), { plainText: true });

    expect(text).toMatch(/reset your password/i);
    expect(text).toContain(resetUrl);
    expect(text).toContain('Reset password');
    expect(text).toContain('If you did not request a password reset');
  });
});
