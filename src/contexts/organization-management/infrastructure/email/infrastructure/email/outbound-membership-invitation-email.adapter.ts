import type { TransactionContext } from '../../../../../../shared/application/ports/transaction-runner.port.js';
import type { OutboundEmailEnqueuePort } from '../../../../../outbound-email/contracts/outbound-email-enqueue.contract.js';
import { OUTBOUND_EMAIL_TEMPLATES } from '../../../../../outbound-email/contracts/outbound-email-template-catalog.js';
import type {
  MembershipInvitationEmailPort,
  EnqueueMembershipInvitationEmailInput,
} from '../../../../application/ports/membership-invitation-email.port.js';
import { ORGANIZATION_MANAGEMENT_AGGREGATE_TYPE } from '../../../../contracts/organization-management-aggregate-types.js';

const TEMPLATE = OUTBOUND_EMAIL_TEMPLATES.MEMBERSHIP_INVITATION;

export class OutboundMembershipInvitationEmailAdapter implements MembershipInvitationEmailPort {
  constructor(
    private readonly outboundEmailEnqueue: OutboundEmailEnqueuePort,
    private readonly transactionContext: TransactionContext,
  ) {}

  async enqueueInvitationEmail(
    input: EnqueueMembershipInvitationEmailInput,
  ): Promise<void> {
    this.validateInput(input);

    const payload: Record<string, unknown> = {
      email: input.email,
      rawToken: input.rawToken,
      scope: input.scope,
      organizationName: input.organizationName,
      expiresAt: input.expiresAt.toISOString(),
    };

    if (input.scope === 'BRANCH') {
      payload.branchName = input.branchName!.trim();
    }

    await this.outboundEmailEnqueue.enqueue(
      {
        idempotencyKey: this.createIdempotencyKey(input.invitationId),
        lane: 'TRANSACTIONAL',
        templateKey: TEMPLATE.key,
        payloadVersion: TEMPLATE.version,
        payload,
        validUntil: input.expiresAt,
        aggregateType:
          ORGANIZATION_MANAGEMENT_AGGREGATE_TYPE.MEMBERSHIP_INVITATION,
        aggregateId: input.invitationId,
      },
      this.transactionContext,
    );
  }

  private createIdempotencyKey(invitationId: string): string {
    return `membership-invitation:${invitationId}`;
  }

  private validateInput(input: EnqueueMembershipInvitationEmailInput): void {
    if (!input || typeof input !== 'object') {
      throw new TypeError('Membership invitation email input is invalid.');
    }

    if (typeof input.invitationId !== 'string' || !input.invitationId.trim()) {
      throw new TypeError('Membership invitation ID is invalid.');
    }

    if (typeof input.email !== 'string' || !input.email.trim()) {
      throw new TypeError('Membership invitation email address is invalid.');
    }

    if (typeof input.rawToken !== 'string' || !input.rawToken.trim()) {
      throw new TypeError('Membership invitation token is invalid.');
    }

    if (input.scope !== 'ORGANIZATION' && input.scope !== 'BRANCH') {
      throw new TypeError('Membership invitation scope is invalid.');
    }

    if (
      typeof input.organizationName !== 'string' ||
      !input.organizationName.trim()
    ) {
      throw new TypeError('Organization name is invalid.');
    }

    if (
      input.scope === 'BRANCH' &&
      (typeof input.branchName !== 'string' || !input.branchName.trim())
    ) {
      throw new TypeError('Branch name is required for branch invitations.');
    }

    if (
      !(input.expiresAt instanceof Date) ||
      !Number.isFinite(input.expiresAt.getTime())
    ) {
      throw new TypeError('Membership invitation expiration date is invalid.');
    }
  }
}
