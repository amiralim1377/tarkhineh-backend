import { createElement } from 'react';
import { render as renderEmail } from 'react-email';
import type { ConfigService } from '@nestjs/config';

import { OutboundEmailTemplateError } from '../../../errors/outbound-email-template.error.js';
import type { OutboundEmailContent } from '../../../ports/outbound-email-provider.port.js';
import type { OutboundEmailTemplate } from '../../outbound-email-template.js';

import { PasswordChangedEmailView } from './password-changed.view.js';

const TEMPLATE_KEY = 'identity.password-changed';
const TEMPLATE_VERSION = 1;
const MAX_EMAIL_LENGTH = 254;

interface ValidatedPayload {
  readonly email: string;
}

export class PasswordChangedEmailTemplate implements OutboundEmailTemplate {
  readonly key = TEMPLATE_KEY;
  readonly version = TEMPLATE_VERSION;

  constructor(private readonly configService: ConfigService) {}

  async render(payload: unknown): Promise<OutboundEmailContent> {
    const { email } = this.validatePayload(payload);

    const logoUrl = this.configService
      .get<string>('OUTBOUND_EMAIL_LOGO_URL')
      ?.trim();

    if (!logoUrl) {
      throw new OutboundEmailTemplateError('RENDER_FAILED');
    }

    const element = createElement(PasswordChangedEmailView, {
      logoUrl,
    });

    const [html, text] = await Promise.all([
      renderEmail(element),
      renderEmail(element, { plainText: true }),
    ]);

    return {
      to: email,
      subject: 'رمز عبور حساب شما تغییر کرد',
      text,
      html,
    };
  }

  private validatePayload(payload: unknown): ValidatedPayload {
    if (
      typeof payload !== 'object' ||
      payload === null ||
      Array.isArray(payload)
    ) {
      throw new OutboundEmailTemplateError('PAYLOAD_INVALID');
    }

    const record = payload as Record<string, unknown>;
    const email = record.email;

    if (
      typeof email !== 'string' ||
      email.length > MAX_EMAIL_LENGTH ||
      email !== email.trim() ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ) {
      throw new OutboundEmailTemplateError('PAYLOAD_INVALID');
    }

    return { email };
  }
}
