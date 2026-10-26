import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Injectable } from '@nestjs/common';
import type { Job } from 'bullmq';
import { PinoLogger } from 'nestjs-pino';

import { OutboundEmailProviderError } from '../../application/errors/outbound-email-provider.error.js';
import { OutboundEmailTemplateError } from '../../application/errors/outbound-email-template.error.js';
import {
  OUTBOUND_EMAIL_DELIVERY_STORE,
  type OutboundEmailDeliveryLane,
  type OutboundEmailDeliveryStore,
  type OutboundEmailDeadErrorCode,
  type OutboundEmailRetryErrorCode,
} from '../../application/ports/outbound-email-delivery-store.port.js';
import { OUTBOUND_EMAIL_PAYLOAD_ENCRYPTOR } from '../../application/ports/outbound-email-payload-encryptor.port.js';
import type { OutboundEmailPayloadEncryptor } from '../../application/ports/outbound-email-payload-encryptor.port.js';
import { OUTBOUND_EMAIL_PROVIDER } from '../../application/ports/outbound-email-provider.port.js';
import type { OutboundEmailProvider } from '../../application/ports/outbound-email-provider.port.js';
import { OutboundEmailTemplateRegistry } from '../../application/templates/outbound-email-template.registry.js';

const LEASE_DURATION_MS = 60_000;
const RETRY_DELAY_MS = 30_000;

interface OutboundEmailJobData {
  readonly outboundEmailMessageId: string;
}

@Injectable()
export class OutboundEmailDeliveryHandler {
  constructor(
    @Inject(OUTBOUND_EMAIL_DELIVERY_STORE)
    private readonly deliveryStore: OutboundEmailDeliveryStore,
    @Inject(OUTBOUND_EMAIL_PAYLOAD_ENCRYPTOR)
    private readonly payloadEncryptor: OutboundEmailPayloadEncryptor,
    @Inject(OUTBOUND_EMAIL_PROVIDER)
    private readonly provider: OutboundEmailProvider,
    private readonly templateRegistry: OutboundEmailTemplateRegistry,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(OutboundEmailDeliveryHandler.name);
  }

  async deliver(
    job: Job<OutboundEmailJobData>,
    lane: OutboundEmailDeliveryLane,
  ): Promise<void> {
    const messageId = job.data?.outboundEmailMessageId;

    if (typeof messageId !== 'string' || !messageId.trim()) {
      this.logger.error(
        { jobId: job.id, lane },
        'Rejected an outbound email Job with invalid data',
      );
      return;
    }

    const delivery = await this.deliveryStore.claimForDelivery({
      messageId,
      lane,
      workerPrefix: `outbound-email-${lane.toLowerCase()}`,
      leaseDurationMs: LEASE_DURATION_MS,
    });

    if (!delivery) {
      return;
    }

    if (!delivery.encryptedPayload) {
      await this.markDead(
        delivery.messageId,
        delivery.leaseToken,
        'PAYLOAD_MISSING',
      );
      return;
    }

    let plaintext: string;

    try {
      plaintext = this.payloadEncryptor.decrypt(delivery.encryptedPayload);
    } catch {
      await this.markDead(
        delivery.messageId,
        delivery.leaseToken,
        'PAYLOAD_DECRYPTION_FAILED',
      );
      return;
    }

    let payload: unknown;

    try {
      payload = JSON.parse(plaintext) as unknown;
    } catch {
      await this.markDead(
        delivery.messageId,
        delivery.leaseToken,
        'PAYLOAD_INVALID',
      );
      return;
    }

    let content;

    try {
      content = await this.templateRegistry.render({
        templateKey: delivery.templateKey,
        payloadVersion: delivery.payloadVersion,
        payload,
      });
    } catch (error: unknown) {
      if (error instanceof OutboundEmailTemplateError) {
        const errorCode: OutboundEmailDeadErrorCode =
          error.kind === 'UNSUPPORTED_TEMPLATE' ||
          error.kind === 'UNSUPPORTED_TEMPLATE_VERSION'
            ? 'UNSUPPORTED_TEMPLATE'
            : 'PAYLOAD_INVALID';

        await this.markDead(delivery.messageId, delivery.leaseToken, errorCode);
        return;
      }

      await this.markDead(
        delivery.messageId,
        delivery.leaseToken,
        'PAYLOAD_INVALID',
      );
      return;
    }

    const preparation = await this.deliveryStore.prepareForDelivery({
      messageId: delivery.messageId,
      leaseToken: delivery.leaseToken,
      leaseDurationMs: LEASE_DURATION_MS,
    });

    if (preparation !== 'READY') {
      return;
    }

    let result;

    try {
      result = await this.provider.send(content);
    } catch (error: unknown) {
      if (error instanceof OutboundEmailProviderError) {
        await this.handleProviderFailure(
          delivery.messageId,
          delivery.leaseToken,
          error,
        );
        return;
      }

      // An unexpected transport failure does not prove that the provider
      // rejected the message. Never retry an ambiguous delivery automatically.
      await this.deliveryStore.markOutcomeUnknown({
        messageId: delivery.messageId,
        leaseToken: delivery.leaseToken,
        errorCode: 'PROVIDER_OUTCOME_UNKNOWN',
      });

      this.logger.error(
        {
          outboxMessageId: delivery.messageId,
          failureKind: 'UNCLASSIFIED_PROVIDER_FAILURE',
        },
        'Outbound email delivery outcome is unknown',
      );
      return;
    }

    const accepted = await this.deliveryStore.markAccepted({
      messageId: delivery.messageId,
      leaseToken: delivery.leaseToken,
      providerMessageId: result.providerMessageId,
    });

    if (!accepted) {
      // The provider accepted the message, but this Worker no longer owns
      // the lease. Do not send the message again.
      this.logger.error(
        {
          outboxMessageId: delivery.messageId,
          failureKind: 'ACCEPTANCE_PERSISTENCE_LEASE_LOST',
        },
        'Provider acceptance could not be recorded under the active lease',
      );
    }
  }

  private async handleProviderFailure(
    messageId: string,
    leaseToken: string,
    error: OutboundEmailProviderError,
  ): Promise<void> {
    switch (error.kind) {
      case 'TEMPORARY_REJECTION':
        await this.scheduleRetry(
          messageId,
          leaseToken,
          'PROVIDER_TEMPORARY_REJECTION',
        );
        return;

      case 'NOT_READY':
        await this.scheduleRetry(messageId, leaseToken, 'PROVIDER_NOT_READY');
        return;

      case 'PERMANENT_REJECTION':
        await this.markDead(
          messageId,
          leaseToken,
          'PROVIDER_PERMANENT_REJECTION',
        );
        return;

      case 'OUTCOME_UNKNOWN':
        await this.deliveryStore.markOutcomeUnknown({
          messageId,
          leaseToken,
          errorCode: 'PROVIDER_OUTCOME_UNKNOWN',
        });
        return;
    }
  }

  private async scheduleRetry(
    messageId: string,
    leaseToken: string,
    errorCode: OutboundEmailRetryErrorCode,
  ): Promise<void> {
    await this.deliveryStore.scheduleRetry({
      messageId,
      leaseToken,
      retryDelayMs: RETRY_DELAY_MS,
      errorCode,
    });
  }

  private async markDead(
    messageId: string,
    leaseToken: string,
    errorCode: OutboundEmailDeadErrorCode,
  ): Promise<void> {
    await this.deliveryStore.markDead({
      messageId,
      leaseToken,
      errorCode,
    });
  }
}

@Processor('email-transactional')
export class TransactionalOutboundEmailDeliveryWorker extends WorkerHost {
  constructor(
    private readonly handler: OutboundEmailDeliveryHandler,
    private readonly logger: PinoLogger,
  ) {
    super();
    this.logger.setContext(TransactionalOutboundEmailDeliveryWorker.name);
  }

  async process(job: Job<OutboundEmailJobData>): Promise<void> {
    await this.handler.deliver(job, 'TRANSACTIONAL');
  }
}

@Processor('email-bulk')
export class BulkOutboundEmailDeliveryWorker extends WorkerHost {
  constructor(
    private readonly handler: OutboundEmailDeliveryHandler,
    private readonly logger: PinoLogger,
  ) {
    super();
    this.logger.setContext(BulkOutboundEmailDeliveryWorker.name);
  }

  async process(job: Job<OutboundEmailJobData>): Promise<void> {
    await this.handler.deliver(job, 'BULK');
  }
}
