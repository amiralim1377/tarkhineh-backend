import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OUTBOUND_EMAIL_TEMPLATES } from '../../../../../outbound-email/contracts/outbound-email-template-catalog.js';
import { ORGANIZATION_MANAGEMENT_AGGREGATE_TYPE } from '../../../../contracts/organization-management-aggregate-types.js';
import {
  TRANSACTION_CONTEXT,
  TransactionContext,
} from '../../../../../../shared/application/ports/transaction-runner.port.js';
import { OutboundEmailEnqueuePort } from '../../../../../outbound-email/contracts/outbound-email-enqueue.contract.js';
import {
  EnqueueMembershipInvitationEmailInput,
  MembershipInvitationEmailPort,
} from '../../../../application/ports/membership-invitation-email.port.js';
import { OutboundMembershipInvitationEmailAdapter } from './outbound-membership-invitation-email.adapter.js';

// ============================================================
// CONSTANTS
// ============================================================

const INVITATION_ID = 'invitation-123';
const EMAIL = 'employee@example.com';
const RAW_TOKEN = 'secure-random-token-123';
const ORGANIZATION_NAME = 'ترخینه';
const BRANCH_NAME = 'شعبه مرکزی';

const EXPIRES_AT = new Date('2026-12-01T12:00:00.000Z');

const TEMPLATE = OUTBOUND_EMAIL_TEMPLATES.MEMBERSHIP_INVITATION;

const AGGREGATE_TYPE =
  ORGANIZATION_MANAGEMENT_AGGREGATE_TYPE.MEMBERSHIP_INVITATION;

// ============================================================
// TRANSACTION CONTEXT
// ============================================================

const transactionContext: TransactionContext = {
  [TRANSACTION_CONTEXT]: true,
};

// ============================================================
// MOCKS
// ============================================================

const outboundEmailEnqueueMock = {
  enqueue: vi.fn<OutboundEmailEnqueuePort['enqueue']>(),
};

// ============================================================
// FIXTURES
// ============================================================

function createInput(
  overrides: Partial<EnqueueMembershipInvitationEmailInput> = {},
): EnqueueMembershipInvitationEmailInput {
  return {
    invitationId: INVITATION_ID,
    email: EMAIL,
    rawToken: RAW_TOKEN,
    scope: 'ORGANIZATION',
    organizationName: ORGANIZATION_NAME,
    expiresAt: EXPIRES_AT,
    ...overrides,
  };
}

// ============================================================
// TEST SUITE
// ============================================================

describe('OutboundMembershipInvitationEmailAdapter', () => {
  let sut: MembershipInvitationEmailPort;

  beforeEach(() => {
    vi.clearAllMocks();

    outboundEmailEnqueueMock.enqueue.mockResolvedValue({
      messageId: 'email-message-123',
    });

    sut = new OutboundMembershipInvitationEmailAdapter(
      outboundEmailEnqueueMock as OutboundEmailEnqueuePort,
      transactionContext,
    );
  });

  // ==========================================================
  // ORGANIZATION INVITATION
  // ==========================================================

  describe('organization invitation', () => {
    it('should enqueue an organization invitation email', async () => {
      await sut.enqueueInvitationEmail(createInput());

      expect(outboundEmailEnqueueMock.enqueue).toHaveBeenCalledOnce();

      expect(outboundEmailEnqueueMock.enqueue).toHaveBeenCalledWith(
        expect.objectContaining({
          lane: 'TRANSACTIONAL',
          templateKey: TEMPLATE.key,
          payloadVersion: TEMPLATE.version,
        }),
        transactionContext,
      );
    });

    it('should map organization invitation payload correctly', async () => {
      await sut.enqueueInvitationEmail(createInput());

      const [emailInput] = outboundEmailEnqueueMock.enqueue.mock.calls[0]!;

      expect(emailInput.payload).toEqual({
        email: EMAIL,
        rawToken: RAW_TOKEN,
        scope: 'ORGANIZATION',
        organizationName: ORGANIZATION_NAME,
        expiresAt: EXPIRES_AT.toISOString(),
      });
    });

    it('should not include branchName in an organization invitation payload', async () => {
      await sut.enqueueInvitationEmail(
        createInput({
          branchName: BRANCH_NAME,
        }),
      );

      const [emailInput] = outboundEmailEnqueueMock.enqueue.mock.calls[0]!;

      expect(emailInput.payload).not.toHaveProperty('branchName');
    });
  });

  // ==========================================================
  // BRANCH INVITATION
  // ==========================================================

  describe('branch invitation', () => {
    it('should enqueue a branch invitation email', async () => {
      await sut.enqueueInvitationEmail(
        createInput({
          scope: 'BRANCH',
          branchName: BRANCH_NAME,
        }),
      );

      expect(outboundEmailEnqueueMock.enqueue).toHaveBeenCalledOnce();
    });

    it('should include branchName in a branch invitation payload', async () => {
      await sut.enqueueInvitationEmail(
        createInput({
          scope: 'BRANCH',
          branchName: BRANCH_NAME,
        }),
      );

      const [emailInput] = outboundEmailEnqueueMock.enqueue.mock.calls[0]!;

      expect(emailInput.payload).toEqual({
        email: EMAIL,
        rawToken: RAW_TOKEN,
        scope: 'BRANCH',
        organizationName: ORGANIZATION_NAME,
        branchName: BRANCH_NAME,
        expiresAt: EXPIRES_AT.toISOString(),
      });
    });

    it('should trim the branch name before enqueueing', async () => {
      await sut.enqueueInvitationEmail(
        createInput({
          scope: 'BRANCH',
          branchName: '  شعبه مرکزی  ',
        }),
      );

      const [emailInput] = outboundEmailEnqueueMock.enqueue.mock.calls[0]!;

      expect(emailInput.payload).toHaveProperty('branchName', BRANCH_NAME);
    });

    it('should not include a branch name for organization invitations', async () => {
      await sut.enqueueInvitationEmail(createInput());

      const [emailInput] = outboundEmailEnqueueMock.enqueue.mock.calls[0]!;

      expect(emailInput.payload.scope).toBe('ORGANIZATION');
      expect(emailInput.payload).not.toHaveProperty('branchName');
    });
  });

  // ==========================================================
  // OUTBOUND EMAIL MAPPING
  // ==========================================================

  describe('outbound email mapping', () => {
    it('should use the invitation ID as the idempotency key', async () => {
      await sut.enqueueInvitationEmail(createInput());

      const [emailInput] = outboundEmailEnqueueMock.enqueue.mock.calls[0]!;

      expect(emailInput.idempotencyKey).toBe(
        `membership-invitation:${INVITATION_ID}`,
      );
    });

    it('should use the registered template key and version', async () => {
      await sut.enqueueInvitationEmail(createInput());

      const [emailInput] = outboundEmailEnqueueMock.enqueue.mock.calls[0]!;

      expect(emailInput.templateKey).toBe(TEMPLATE.key);
      expect(emailInput.payloadVersion).toBe(TEMPLATE.version);
    });

    it('should use the TRANSACTIONAL lane', async () => {
      await sut.enqueueInvitationEmail(createInput());

      const [emailInput] = outboundEmailEnqueueMock.enqueue.mock.calls[0]!;

      expect(emailInput.lane).toBe('TRANSACTIONAL');
    });

    it('should use the invitation as the aggregate reference', async () => {
      await sut.enqueueInvitationEmail(createInput());

      const [emailInput] = outboundEmailEnqueueMock.enqueue.mock.calls[0]!;

      expect(emailInput.aggregateType).toBe(AGGREGATE_TYPE);
      expect(emailInput.aggregateId).toBe(INVITATION_ID);
    });

    it('should use the invitation expiration as the email expiration', async () => {
      await sut.enqueueInvitationEmail(createInput());

      const [emailInput] = outboundEmailEnqueueMock.enqueue.mock.calls[0]!;

      expect(emailInput.validUntil).toBe(EXPIRES_AT);
    });

    it('should pass the original transaction context to Outbound Email', async () => {
      await sut.enqueueInvitationEmail(createInput());

      expect(outboundEmailEnqueueMock.enqueue).toHaveBeenCalledWith(
        expect.any(Object),
        transactionContext,
      );
    });

    it('should return void after successfully enqueueing the email', async () => {
      const result = await sut.enqueueInvitationEmail(createInput());

      expect(result).toBeUndefined();
    });

    it('should propagate Outbound Email enqueue errors', async () => {
      const enqueueError = new Error('Outbound email enqueue failed.');

      outboundEmailEnqueueMock.enqueue.mockRejectedValue(enqueueError);

      await expect(sut.enqueueInvitationEmail(createInput())).rejects.toBe(
        enqueueError,
      );
    });
  });

  // ==========================================================
  // INPUT VALIDATION
  // ==========================================================

  describe('input validation', () => {
    it('should reject a null input', async () => {
      await expect(
        sut.enqueueInvitationEmail(
          null as unknown as EnqueueMembershipInvitationEmailInput,
        ),
      ).rejects.toThrow(TypeError);

      expect(outboundEmailEnqueueMock.enqueue).not.toHaveBeenCalled();
    });

    it('should reject an empty invitation ID', async () => {
      await expect(
        sut.enqueueInvitationEmail(
          createInput({
            invitationId: '   ',
          }),
        ),
      ).rejects.toThrow(TypeError);

      expect(outboundEmailEnqueueMock.enqueue).not.toHaveBeenCalled();
    });

    it('should reject an empty email address', async () => {
      await expect(
        sut.enqueueInvitationEmail(
          createInput({
            email: '   ',
          }),
        ),
      ).rejects.toThrow(TypeError);

      expect(outboundEmailEnqueueMock.enqueue).not.toHaveBeenCalled();
    });

    it('should reject an empty raw token', async () => {
      await expect(
        sut.enqueueInvitationEmail(
          createInput({
            rawToken: '   ',
          }),
        ),
      ).rejects.toThrow(TypeError);

      expect(outboundEmailEnqueueMock.enqueue).not.toHaveBeenCalled();
    });

    it('should reject an invalid invitation scope', async () => {
      await expect(
        sut.enqueueInvitationEmail(
          createInput({
            scope: 'INVALID' as EnqueueMembershipInvitationEmailInput['scope'],
          }),
        ),
      ).rejects.toThrow(TypeError);

      expect(outboundEmailEnqueueMock.enqueue).not.toHaveBeenCalled();
    });

    it('should reject an empty organization name', async () => {
      await expect(
        sut.enqueueInvitationEmail(
          createInput({
            organizationName: '   ',
          }),
        ),
      ).rejects.toThrow(TypeError);

      expect(outboundEmailEnqueueMock.enqueue).not.toHaveBeenCalled();
    });

    it('should reject a branch invitation without a branch name', async () => {
      await expect(
        sut.enqueueInvitationEmail(
          createInput({
            scope: 'BRANCH',
          }),
        ),
      ).rejects.toThrow('Branch name is required for branch invitations.');

      expect(outboundEmailEnqueueMock.enqueue).not.toHaveBeenCalled();
    });

    it('should reject an empty branch name', async () => {
      await expect(
        sut.enqueueInvitationEmail(
          createInput({
            scope: 'BRANCH',
            branchName: '   ',
          }),
        ),
      ).rejects.toThrow('Branch name is required for branch invitations.');

      expect(outboundEmailEnqueueMock.enqueue).not.toHaveBeenCalled();
    });

    it('should reject an invalid expiration date', async () => {
      await expect(
        sut.enqueueInvitationEmail(
          createInput({
            expiresAt: new Date(Number.NaN),
          }),
        ),
      ).rejects.toThrow(TypeError);

      expect(outboundEmailEnqueueMock.enqueue).not.toHaveBeenCalled();
    });
  });
});
