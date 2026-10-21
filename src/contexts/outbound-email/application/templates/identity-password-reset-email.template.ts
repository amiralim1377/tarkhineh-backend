import { OutboundEmailTemplateError } from '../errors/outbound-email-template.error.js';

import type { OutboundEmailContent } from '../ports/outbound-email-provider.port.js';
import type { OutboundEmailTemplate } from './outbound-email-template.js';

const TEMPLATE_KEY = 'identity.password-reset';
const TEMPLATE_VERSION = 1;

const MAX_RESET_URL_LENGTH = 4096;
const MAX_TOKEN_LENGTH = 2048;
const MAX_EMAIL_LENGTH = 254;

interface ValidatedResetPayload {
  readonly email: string;
  readonly resetUrl: string;
}

export class IdentityPasswordResetEmailTemplate implements OutboundEmailTemplate {
  readonly key = TEMPLATE_KEY;
  readonly version = TEMPLATE_VERSION;

  render(payload: unknown): OutboundEmailContent {
    const validatedPayload = this.validatePayload(payload);

    const { email, resetUrl } = validatedPayload;

    return {
      to: email,
      subject: 'Reset your Tarkhineh password',
      text: [
        'Hello,',
        '',
        'We received a request to reset your Tarkhineh password.',
        'Use the following link to choose a new password:',
        '',
        resetUrl,
        '',
        'If you did not request a password reset, you can ignore this email.',
        '',
        'For security reasons, this link expires automatically.',
      ].join('\n'),
      html: this.renderHtml(resetUrl),
    };
  }

  private validatePayload(payload: unknown): ValidatedResetPayload {
    if (
      typeof payload !== 'object' ||
      payload === null ||
      Array.isArray(payload)
    ) {
      throw new OutboundEmailTemplateError('PAYLOAD_INVALID');
    }

    const record = payload as Record<string, unknown>;
    const resetUrlValue = record.resetUrl;

    if (
      typeof resetUrlValue !== 'string' ||
      resetUrlValue.length === 0 ||
      resetUrlValue.length > MAX_RESET_URL_LENGTH
    ) {
      throw new OutboundEmailTemplateError('PAYLOAD_INVALID');
    }

    let url: URL;

    try {
      url = new URL(resetUrlValue);
    } catch {
      throw new OutboundEmailTemplateError('PAYLOAD_INVALID');
    }

    if (
      (url.protocol !== 'https:' && url.protocol !== 'http:') ||
      url.username.length > 0 ||
      url.password.length > 0 ||
      url.pathname !== '/reset-password' ||
      url.hash.length > 0
    ) {
      throw new OutboundEmailTemplateError('PAYLOAD_INVALID');
    }

    const tokenValues = url.searchParams.getAll('token');
    const emailValues = url.searchParams.getAll('email');
    const queryKeys = [...url.searchParams.keys()];

    if (
      tokenValues.length !== 1 ||
      emailValues.length !== 1 ||
      queryKeys.length !== 2 ||
      queryKeys.some((key) => key !== 'token' && key !== 'email')
    ) {
      throw new OutboundEmailTemplateError('PAYLOAD_INVALID');
    }

    const token = tokenValues[0];
    const email = emailValues[0];

    if (
      !token ||
      token.length > MAX_TOKEN_LENGTH ||
      !this.isValidEmail(email)
    ) {
      throw new OutboundEmailTemplateError('PAYLOAD_INVALID');
    }

    return {
      email,
      resetUrl: url.toString(),
    };
  }

  private isValidEmail(value: string): boolean {
    return (
      value.length <= MAX_EMAIL_LENGTH &&
      value === value.trim() &&
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
    );
  }

  private renderHtml(resetUrl: string): string {
    const safeResetUrl = this.escapeHtml(resetUrl);

    return [
      '<!doctype html>',
      '<html lang="en">',
      '<head>',
      '<meta charset="utf-8">',
      '<meta name="viewport" content="width=device-width, initial-scale=1">',
      '<title>Reset your Tarkhineh password</title>',
      '</head>',
      '<body>',
      '<main>',
      '<h1>Reset your password</h1>',
      '<p>We received a request to reset your Tarkhineh password.</p>',
      '<p>Use the link below to choose a new password.</p>',
      `<p><a href="${safeResetUrl}">Reset password</a></p>`,
      '<p>If you did not request a password reset, you can ignore this email.</p>',
      '<p>For security reasons, this link expires automatically.</p>',
      '</main>',
      '</body>',
      '</html>',
    ].join('');
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}
