import { describe, expect, it } from 'vitest';

import { OutboundEmailTemplateError } from '../errors/outbound-email-template.error.js';
import { IdentityEmailVerificationEmailTemplate } from './identity-email-verification-email.template.js';

describe('IdentityEmailVerificationEmailTemplate', () => {
  const template = new IdentityEmailVerificationEmailTemplate();
  const email = 'user@example.com';
  const verificationUrl =
    'https://api.example/auth/verify-email?token=opaque-token_123';

  it('exposes the expected template key and version', () => {
    expect(template.key).toBe('identity.email-verification');
    expect(template.version).toBe(1);
  });

  it('renders a valid verification payload', () => {
    const content = template.render({ email, verificationUrl });

    expect(content.to).toBe(email);
    expect(content.subject).toBe('Verify your Tarkhineh email');
    expect(content.text).toContain(verificationUrl);
    expect(content.text).toContain('Verify your email address');
    expect(content.text).toContain(
      'If you did not request this registration, you can ignore this email.',
    );
    expect(content.html).toContain('Verify email address');
    expect(content.html).toContain(`href="${verificationUrl}"`);
  });

  it.each([
    ['null payload', null],
    ['array payload', []],
    ['missing email', { verificationUrl }],
    ['invalid email', { email: 'invalid-email', verificationUrl }],
    ['missing URL', { email }],
    ['non-string URL', { email, verificationUrl: 123 }],
    ['empty URL', { email, verificationUrl: '' }],
    ['malformed URL', { email, verificationUrl: 'not-a-url' }],
    [
      'unsafe protocol',
      { email, verificationUrl: 'javascript:alert(1)' },
    ],
    [
      'unexpected path',
      {
        email,
        verificationUrl: 'https://api.example/other?token=opaque-token',
      },
    ],
    [
      'missing token',
      { email, verificationUrl: 'https://api.example/auth/verify-email' },
    ],
    [
      'duplicate token',
      {
        email,
        verificationUrl:
          'https://api.example/auth/verify-email?token=one&token=two',
      },
    ],
    [
      'unexpected query parameter',
      {
        email,
        verificationUrl:
          'https://api.example/auth/verify-email?token=abc&email=user%40example.com',
      },
    ],
    [
      'fragment is present',
      {
        email,
        verificationUrl:
          'https://api.example/auth/verify-email?token=abc#fragment',
      },
    ],
    [
      'credentials are present',
      {
        email,
        verificationUrl:
          'https://attacker:password@api.example/auth/verify-email?token=abc',
      },
    ],
  ])('rejects %s', (_description, payload) => {
    expect(() => template.render(payload)).toThrow(OutboundEmailTemplateError);
  });
});
