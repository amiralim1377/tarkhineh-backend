import { describe, expect, it } from 'vitest';

import { OutboundEmailTemplateError } from '../../../errors/outbound-email-template.error.js';
import { IdentityPasswordResetEmailTemplate } from './identity-password-reset-email.template.js';
import { ConfigService } from '@nestjs/config';

describe('IdentityPasswordResetEmailTemplate', () => {
  const configService = new ConfigService({
    OUTBOUND_EMAIL_LOGO_URL:
      'https://assets.example.test/tarkhineh-logo-white.png',
  });

  const template = new IdentityPasswordResetEmailTemplate(configService);

  const resetUrl =
    'https://frontend.example/reset-password?token=opaque-token_123&email=user%40example.com';

  it('exposes the expected template key and version', () => {
    expect(template.key).toBe('identity.password-reset');
    expect(template.version).toBe(1);
  });

  it('renders a valid reset payload', async () => {
    const content = await template.render({ resetUrl });

    expect(content.to).toBe('user@example.com');
    expect(content.subject).toBe('بازیابی رمز عبور ترخینه');
    expect(content.text).toContain(resetUrl);
    expect(content.text).toContain(
      'اگر شما درخواست بازیابی رمز عبور نداده‌اید',
    );
    expect(content.html).toContain('بازیابی رمز عبور');
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
  ])('rejects %s', async (_description, payload) => {
    await expect(template.render(payload)).rejects.toThrow(
      OutboundEmailTemplateError,
    );
  });
});
