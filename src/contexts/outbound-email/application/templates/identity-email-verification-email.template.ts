import { OutboundEmailTemplateError } from '../errors/outbound-email-template.error.js';
import type { OutboundEmailContent } from '../ports/outbound-email-provider.port.js';
import type { OutboundEmailTemplate } from './outbound-email-template.js';

const TEMPLATE_KEY = 'identity.email-verification';
const TEMPLATE_VERSION = 1;

const MAX_VERIFICATION_URL_LENGTH = 4096;
const MAX_TOKEN_LENGTH = 2048;
const MAX_EMAIL_LENGTH = 254;

interface ValidatedVerificationPayload {
  readonly email: string;
  readonly verificationUrl: string;
}

export class IdentityEmailVerificationEmailTemplate implements OutboundEmailTemplate {
  readonly key = TEMPLATE_KEY;
  readonly version = TEMPLATE_VERSION;

  render(payload: unknown): OutboundEmailContent {
    const validatedPayload = this.validatePayload(payload);
    const { email, verificationUrl } = validatedPayload;

    return {
      to: email,
      subject: 'Verify your Tarkhineh email',
      text: [
        'Welcome to Tarkhineh.',
        '',
        'Verify your email address to complete your registration:',
        '',
        verificationUrl,
        '',
        'This link expires automatically.',
        'If you did not request this registration, you can ignore this email.',
      ].join('\n'),
      html: this.renderHtml(verificationUrl),
    };
  }

  private validatePayload(payload: unknown): ValidatedVerificationPayload {
    if (
      typeof payload !== 'object' ||
      payload === null ||
      Array.isArray(payload)
    ) {
      throw new OutboundEmailTemplateError('PAYLOAD_INVALID');
    }

    const record = payload as Record<string, unknown>;
    const emailValue = record.email;
    const verificationUrlValue = record.verificationUrl;

    if (
      typeof emailValue !== 'string' ||
      !this.isValidEmail(emailValue) ||
      typeof verificationUrlValue !== 'string' ||
      verificationUrlValue.length === 0 ||
      verificationUrlValue.length > MAX_VERIFICATION_URL_LENGTH
    ) {
      throw new OutboundEmailTemplateError('PAYLOAD_INVALID');
    }

    let url: URL;

    try {
      url = new URL(verificationUrlValue);
    } catch {
      throw new OutboundEmailTemplateError('PAYLOAD_INVALID');
    }

    if (
      (url.protocol !== 'https:' && url.protocol !== 'http:') ||
      url.username.length > 0 ||
      url.password.length > 0 ||
      url.pathname !== '/auth/verify-email' ||
      url.hash.length > 0
    ) {
      throw new OutboundEmailTemplateError('PAYLOAD_INVALID');
    }

    const tokenValues = url.searchParams.getAll('token');
    const queryKeys = [...url.searchParams.keys()];
    const token = tokenValues[0];

    if (
      tokenValues.length !== 1 ||
      queryKeys.length !== 1 ||
      queryKeys[0] !== 'token' ||
      !token ||
      token.length > MAX_TOKEN_LENGTH
    ) {
      throw new OutboundEmailTemplateError('PAYLOAD_INVALID');
    }

    return {
      email: emailValue,
      verificationUrl: url.toString(),
    };
  }

  private isValidEmail(value: string): boolean {
    return (
      value.length <= MAX_EMAIL_LENGTH &&
      value === value.trim() &&
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
    );
  }

  private renderHtml(verificationUrl: string): string {
    const safeVerificationUrl = this.escapeHtml(verificationUrl);

    return [
      '<!doctype html>',
      '<html lang="en">',
      '<head>',
      '<meta charset="utf-8">',
      '<meta name="viewport" content="width=device-width, initial-scale=1">',
      '<title>Verify your Tarkhineh email</title>',
      '</head>',
      '<body>',
      '<main>',
      '<h1>Welcome to Tarkhineh</h1>',
      '<p>Verify your email address to complete your registration.</p>',
      `<p><a href="${safeVerificationUrl}">Verify email address</a></p>`,
      '<p>This link expires automatically.</p>',
      '<p>If you did not request this registration, you can ignore this email.</p>',
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
