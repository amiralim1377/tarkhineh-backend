import { createElement } from 'react';
import { render as renderEmail } from 'react-email';

import { OutboundEmailTemplateError } from '../errors/outbound-email-template.error.js';
import type { OutboundEmailContent } from '../ports/outbound-email-provider.port.js';
import type { OutboundEmailTemplate } from './outbound-email-template.js';
import { IdentityPasswordResetEmailView } from './components/identity/password-reset/identity-password-reset-email.view.js';

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

  async render(payload: unknown): Promise<OutboundEmailContent> {
    const validatedPayload = this.validatePayload(payload);
    const { email, resetUrl } = validatedPayload;

    const element = createElement(IdentityPasswordResetEmailView, {
      resetUrl,
    });

    const [html, text] = await Promise.all([
      renderEmail(element),
      renderEmail(element, { plainText: true }),
    ]);

    return {
      to: email,
      subject: 'Reset your Tarkhineh password',
      text,
      html,
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
}
