import { describe, expect, it } from 'vitest';

import { OutboundEmailTemplateError } from '../errors/outbound-email-template.error.js';
import { IdentityPasswordResetEmailTemplate } from './identity-password-reset-email.template.js';

describe('IdentityPasswordResetEmailTemplate', () => {
  const template = new IdentityPasswordResetEmailTemplate();

  const resetUrl =
    'https://frontend.example/reset-password?token=opaque-token_123&email=user%40example.com';

  it('exposes the expected template key and version', () => {
    expect(template.key).toBe('identity.password-reset');
    expect(template.version).toBe(1);
  });

  it('renders a valid reset payload', () => {
    const content = template.render({ resetUrl });

    expect(content.to).toBe('user@example.com');
    expect(content.subject).toBe('Reset your Tarkhineh password');
    expect(content.text).toContain(resetUrl);
    expect(content.text).toContain('If you did not request a password reset');
    expect(content.html).toContain('Reset password');
    expect(content.html).toContain(
      'href="https://frontend.example/reset-password?token=opaque-token_123&amp;email=user%40example.com"',
    );
  });

  it.each([
    ['null payload', null],
    ['array payload', []],
    ['missing reset URL', {}],
    ['non-string reset URL', { resetUrl: 123 }],
    ['empty reset URL', { resetUrl: '' }],
    ['malformed reset URL', { resetUrl: 'not-a-url' }],
    ['unsafe protocol', { resetUrl: 'javascript:alert(1)' }],
    [
      'unexpected path',
      {
        resetUrl:
          'https://frontend.example/other?token=abc&email=user%40example.com',
      },
    ],
    [
      'missing token',
      {
        resetUrl:
          'https://frontend.example/reset-password?email=user%40example.com',
      },
    ],
    [
      'duplicate token',
      {
        resetUrl:
          'https://frontend.example/reset-password?token=one&token=two&email=user%40example.com',
      },
    ],
    [
      'invalid email',
      {
        resetUrl:
          'https://frontend.example/reset-password?token=abc&email=invalid-email',
      },
    ],
    [
      'fragment is present',
      {
        resetUrl:
          'https://frontend.example/reset-password?token=abc&email=user%40example.com#fragment',
      },
    ],
  ])('rejects %s', (_description, payload) => {
    expect(() => template.render(payload)).toThrow(OutboundEmailTemplateError);
  });
});
