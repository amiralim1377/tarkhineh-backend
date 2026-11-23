import { Inject, Injectable } from '@nestjs/common';
import {
  MEMBERSHIP_INVITATION_EMAIL_PORT,
  type MembershipInvitationEmailPort,
  type EnqueueMembershipInvitationEmailInput,
} from '../../application/ports/membership-invitation-email.port.js';
import {
  OUTBOUND_EMAIL_ENQUEUE,
  type OutboundEmailEnqueuePort,
} from '../../../outbound-email/contracts/outbound-email-enqueue.contract.js';

@Injectable()
export class OutboundMembershipInvitationEmailAdapter implements MembershipInvitationEmailPort {
  constructor(
    @Inject(OUTBOUND_EMAIL_ENQUEUE)
    private readonly outboundEmailEnqueue: OutboundEmailEnqueuePort,
  ) {}

  async enqueueInvitationEmail(
    input: EnqueueMembershipInvitationEmailInput,
  ): Promise<void> {
    await this.outboundEmailEnqueue.enqueue({
      idempotencyKey: `membership-invitation:${input.invitationId}`,
      lane: 'TRANSACTIONAL',
      templateKey: 'organization.membership-invitation',
      payloadVersion: 1,
      payload: {
        email: input.email,
        rawToken: input.rawToken,
        scope: input.scope,
        organizationName: input.organizationName,
        ...(input.branchName ? { branchName: input.branchName } : {}),
      },
      validUntil: input.expiresAt,
      aggregateType: 'MembershipInvitation',
      aggregateId: input.invitationId,
    });
  }
}
