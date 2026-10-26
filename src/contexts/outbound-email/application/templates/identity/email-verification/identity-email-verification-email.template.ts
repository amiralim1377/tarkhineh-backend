import { createElement } from 'react';
import { render as renderEmail } from 'react-email';
import type { ConfigService } from '@nestjs/config';

import { OutboundEmailTemplateError } from '../../../errors/outbound-email-template.error.js';
import type { OutboundEmailContent } from '../../../ports/outbound-email-provider.port.js';
import type { OutboundEmailTemplate } from '../../outbound-email-template.js';
import { IdentityEmailVerificationEmailView } from './identity-email-verification-email.view.js';

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

  constructor(private readonly configService: ConfigService) {}

  async render(payload: unknown): Promise<OutboundEmailContent> {
    const validatedPayload = this.validatePayload(payload);
    const { email, verificationUrl } = validatedPayload;

    const logoUrl = this.configService
      .get<string>('OUTBOUND_EMAIL_LOGO_URL')
      ?.trim();

    if (!logoUrl) {
      throw new OutboundEmailTemplateError('RENDER_FAILED');
    }

    const element = createElement(IdentityEmailVerificationEmailView, {
      verificationUrl,
      logoUrl,
    });

    const [html, text] = await Promise.all([
      renderEmail(element),
      renderEmail(element, { plainText: true }),
    ]);

    return {
      to: email,
      subject: 'تأیید ایمیل ترخینه',
      text,
      html,
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
}
