import { createElement } from 'react';
import { render as renderEmail } from 'react-email';
import { OutboundEmailTemplateError } from '../../../errors/outbound-email-template.error.js';
import type { ConfigService } from '@nestjs/config';
import type { OutboundEmailContent } from '../../../ports/outbound-email-provider.port.js';
import type { OutboundEmailTemplate } from '../../outbound-email-template.js';
import { MembershipInvitationEmailView } from './membership-invitation.view.js';
import { OUTBOUND_EMAIL_TEMPLATES } from '../../../../contracts/outbound-email-template-catalog.js';

const TEMPLATE = OUTBOUND_EMAIL_TEMPLATES.MEMBERSHIP_INVITATION;

const MAX_EMAIL_LENGTH = 254;
const MAX_TOKEN_LENGTH = 2048;
const MAX_ORGANIZATION_NAME_LENGTH = 200;
const MAX_BRANCH_NAME_LENGTH = 200;
const MAX_INVITATION_URL_LENGTH = 4096;

type MembershipInvitationScope = 'ORGANIZATION' | 'BRANCH';

interface ValidatedMembershipInvitationPayload {
  readonly email: string;
  readonly rawToken: string;
  readonly scope: MembershipInvitationScope;
  readonly organizationName: string;
  readonly branchName: string | null;
  readonly expiresAt: Date;
}

export class MembershipInvitationEmailTemplate implements OutboundEmailTemplate {
  readonly key = TEMPLATE.key;
  readonly version = TEMPLATE.version;

  constructor(private readonly configService: ConfigService) {}

  async render(payload: unknown): Promise<OutboundEmailContent> {
    const validatedPayload = this.validatePayload(payload);

    const { email, rawToken, scope, organizationName, branchName, expiresAt } =
      validatedPayload;

    const logoUrl = this.configService
      .get<string>('OUTBOUND_EMAIL_LOGO_URL')
      ?.trim();

    if (!logoUrl) {
      throw new OutboundEmailTemplateError('RENDER_FAILED');
    }

    const invitationUrl = this.createInvitationUrl(rawToken);

    const expiresAtLabel = new Intl.DateTimeFormat('fa-IR', {
      dateStyle: 'long',
      timeStyle: 'short',
      timeZone: 'Asia/Tehran',
    }).format(expiresAt);

    const element = createElement(MembershipInvitationEmailView, {
      invitationUrl,
      organizationName,
      branchName,
      scope,
      expiresAtLabel,
      logoUrl,
    });

    const [html, text] = await Promise.all([
      renderEmail(element),
      renderEmail(element, { plainText: true }),
    ]);

    const subject =
      scope === 'BRANCH' && branchName
        ? `دعوت به همکاری در شعبه ${branchName}`
        : `دعوت به عضویت در سازمان ${organizationName}`;

    return {
      to: email,
      subject,
      text,
      html,
    };
  }

  private validatePayload(
    payload: unknown,
  ): ValidatedMembershipInvitationPayload {
    if (
      typeof payload !== 'object' ||
      payload === null ||
      Array.isArray(payload)
    ) {
      throw new OutboundEmailTemplateError('PAYLOAD_INVALID');
    }

    const record = payload as Record<string, unknown>;

    const email = record.email;
    const rawToken = record.rawToken;
    const scope = record.scope;
    const organizationName = record.organizationName;
    const branchName = record.branchName;
    const expiresAtValue = record.expiresAt;

    if (
      typeof email !== 'string' ||
      !this.isValidEmail(email) ||
      typeof rawToken !== 'string' ||
      !rawToken.trim() ||
      rawToken !== rawToken.trim() ||
      rawToken.length > MAX_TOKEN_LENGTH ||
      (scope !== 'ORGANIZATION' && scope !== 'BRANCH') ||
      typeof organizationName !== 'string' ||
      !organizationName.trim() ||
      organizationName.length > MAX_ORGANIZATION_NAME_LENGTH ||
      typeof expiresAtValue !== 'string'
    ) {
      throw new OutboundEmailTemplateError('PAYLOAD_INVALID');
    }

    const expiresAt = new Date(expiresAtValue);

    if (
      !Number.isFinite(expiresAt.getTime()) ||
      expiresAt.toISOString() !== expiresAtValue
    ) {
      throw new OutboundEmailTemplateError('PAYLOAD_INVALID');
    }

    let validatedBranchName: string | null = null;

    if (scope === 'BRANCH') {
      if (
        typeof branchName !== 'string' ||
        !branchName.trim() ||
        branchName.length > MAX_BRANCH_NAME_LENGTH
      ) {
        throw new OutboundEmailTemplateError('PAYLOAD_INVALID');
      }

      validatedBranchName = branchName.trim();
    } else if (branchName !== undefined && branchName !== null) {
      throw new OutboundEmailTemplateError('PAYLOAD_INVALID');
    }

    return {
      email,
      rawToken,
      scope,
      organizationName: organizationName.trim(),
      branchName: validatedBranchName,
      expiresAt,
    };
  }

  private createInvitationUrl(rawToken: string): string {
    const configuredUrl = this.configService
      .get<string>('OUTBOUND_EMAIL_MEMBERSHIP_INVITATION_URL')
      ?.trim();

    if (!configuredUrl) {
      throw new OutboundEmailTemplateError('RENDER_FAILED');
    }

    let url: URL;

    try {
      url = new URL(configuredUrl);
    } catch {
      throw new OutboundEmailTemplateError('RENDER_FAILED');
    }

    if (
      (url.protocol !== 'https:' && url.protocol !== 'http:') ||
      url.username.length > 0 ||
      url.password.length > 0 ||
      url.hash.length > 0 ||
      url.searchParams.has('token')
    ) {
      throw new OutboundEmailTemplateError('RENDER_FAILED');
    }

    url.searchParams.set('token', rawToken);

    const invitationUrl = url.toString();

    if (invitationUrl.length > MAX_INVITATION_URL_LENGTH) {
      throw new OutboundEmailTemplateError('RENDER_FAILED');
    }

    return invitationUrl;
  }

  private isValidEmail(value: string): boolean {
    return (
      value.length <= MAX_EMAIL_LENGTH &&
      value === value.trim() &&
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
    );
  }
}
