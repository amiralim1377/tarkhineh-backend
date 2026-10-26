import { createElement } from 'react';
import { ConfigService } from '@nestjs/config';
import { render as renderEmail } from 'react-email';

import { OutboundEmailTemplateError } from '../../../errors/outbound-email-template.error.js';

import type { OutboundEmailTemplate } from '../../outbound-email-template.js';

import { WelcomeEmailView } from './welcome.view.js';
import { OutboundEmailContent } from '../../../ports/outbound-email-provider.port.js';

interface WelcomeEmailPayload {
  readonly email: string;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class IdentityWelcomeEmailTemplate implements OutboundEmailTemplate {
  readonly key = 'identity.welcome';
  readonly version = 1;

  constructor(private readonly configService: ConfigService) {}

  private validatePayload(payload: unknown): WelcomeEmailPayload {
    if (
      typeof payload !== 'object' ||
      payload === null ||
      Array.isArray(payload)
    ) {
      throw new OutboundEmailTemplateError('RENDER_FAILED');
    }

    const email = (payload as Record<string, unknown>).email;

    if (
      typeof email !== 'string' ||
      email.length > 254 ||
      email.trim() !== email ||
      !EMAIL_PATTERN.test(email)
    ) {
      throw new OutboundEmailTemplateError('RENDER_FAILED');
    }

    return { email };
  }

  async render(payload: unknown): Promise<OutboundEmailContent> {
    const { email } = this.validatePayload(payload);

    const logoUrl = this.configService.get<string>('OUTBOUND_EMAIL_LOGO_URL');

    if (!logoUrl) {
      throw new OutboundEmailTemplateError('RENDER_FAILED');
    }

    try {
      const element = createElement(WelcomeEmailView, {
        logoUrl,
      });

      const [html, text] = await Promise.all([
        renderEmail(element),
        renderEmail(element, { plainText: true }),
      ]);

      return {
        to: email,
        subject: 'به ترخینه خوش آمدید',
        html,
        text,
      };
    } catch (error: unknown) {
      if (error instanceof OutboundEmailTemplateError) {
        throw error;
      }

      throw new OutboundEmailTemplateError('RENDER_FAILED');
    }
  }
}
