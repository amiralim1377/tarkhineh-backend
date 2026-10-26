import { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';

import { OutboundEmailTemplateError } from '../errors/outbound-email-template.error.js';
import { IdentityEmailVerificationEmailTemplate } from './identity-email-verification-email.template.js';

describe('IdentityEmailVerificationEmailTemplate', () => {
  const email = 'user@example.com';

  const verificationUrl =
    'https://api.example/auth/verify-email?token=opaque-token_123';

  const logoUrl = 'https://assets.example.test/tarkhineh-logo-white.png';

  const configService = new ConfigService({
    OUTBOUND_EMAIL_LOGO_URL: logoUrl,
  });

  const template = new IdentityEmailVerificationEmailTemplate(configService);

  it('exposes the expected template key and version', () => {
    expect(template.key).toBe('identity.email-verification');
    expect(template.version).toBe(1);
  });

  it('renders a valid verification payload in Persian', async () => {
    const content = await template.render({
      email,
      verificationUrl,
    });

    expect(content.to).toBe(email);
    expect(content.subject).toBe('تأیید ایمیل ترخینه');

    expect(content.text).toContain('به ترخینه خوش آمدید');
    expect(content.text).toContain('تأیید نشانی ایمیل');
    expect(content.text).toContain(verificationUrl);
    expect(content.text).toContain(
      'این ایمیل به‌صورت خودکار از طرف ترخینه ارسال شده است.',
    );

    expect(content.html).toContain('به ترخینه خوش آمدید');
    expect(content.html).toContain('تأیید نشانی ایمیل');
    expect(content.html).toContain(`href="${verificationUrl}"`);
    expect(content.html).toContain(logoUrl);
    expect(content.html).toContain('<html dir="rtl" lang="fa">');
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
    ['unsafe protocol', { email, verificationUrl: 'javascript:alert(1)' }],
    [
      'unexpected path',
      {
        email,
        verificationUrl: 'https://api.example/other?token=opaque-token',
      },
    ],
    [
      'missing token',
      {
        email,
        verificationUrl: 'https://api.example/auth/verify-email',
      },
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
  ])('rejects %s', async (_description, payload) => {
    await expect(template.render(payload)).rejects.toBeInstanceOf(
      OutboundEmailTemplateError,
    );
  });
});
