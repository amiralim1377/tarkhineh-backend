import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';

import { PrismaModule } from '../../prisma/prisma.module.js';

import { OUTBOUND_EMAIL_PAYLOAD_ENCRYPTOR } from './application/ports/outbound-email-payload-encryptor.port.js';
import { OUTBOUND_EMAIL_PROVIDER } from './application/ports/outbound-email-provider.port.js';
import { OUTBOUND_EMAIL_DISPATCH_STORE } from './application/ports/outbound-email-dispatch-store.port.js';
import { OUTBOUND_EMAIL_DELIVERY_STORE } from './application/ports/outbound-email-delivery-store.port.js';

import { OutboundEmailTemplateRegistry } from './application/templates/outbound-email-template.registry.js';
import { IdentityPasswordResetEmailTemplate } from './application/templates/identity-password-reset-email.template.js';

import { AesGcmOutboundEmailPayloadEncryptor } from './infrastructure/security/aes-gcm-outbound-email-payload-encryptor.js';
import { SmtpOutboundEmailProvider } from './infrastructure/providers/smtp-outbound-email.provider.js';
import { PrismaOutboundEmailDispatchStore } from './infrastructure/persistence/prisma-outbound-email-dispatch.store.js';
import { PrismaOutboundEmailDeliveryStore } from './infrastructure/persistence/prisma-outbound-email-delivery.store.js';
import { OutboundEmailDispatcher } from './infrastructure/queue/outbound-email-dispatcher.js';
import { OutboundEmailReconciler } from './infrastructure/queue/outbound-email-reconciler.js';
import {
  BulkOutboundEmailDeliveryWorker,
  OutboundEmailDeliveryHandler,
  TransactionalOutboundEmailDeliveryWorker,
} from './infrastructure/queue/outbound-email-delivery.worker.js';
import { IdentityEmailVerificationEmailTemplate } from './application/templates/identity-email-verification-email.template.js';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    BullModule.registerQueue({
      name: 'email-transactional',
    }),
    BullModule.registerQueue({
      name: 'email-bulk',
    }),
  ],
  providers: [
    AesGcmOutboundEmailPayloadEncryptor,
    SmtpOutboundEmailProvider,
    PrismaOutboundEmailDispatchStore,
    PrismaOutboundEmailDeliveryStore,
    OutboundEmailDeliveryHandler,
    TransactionalOutboundEmailDeliveryWorker,
    BulkOutboundEmailDeliveryWorker,
    OutboundEmailDispatcher,
    OutboundEmailReconciler,
    {
      provide: OUTBOUND_EMAIL_PAYLOAD_ENCRYPTOR,
      useExisting: AesGcmOutboundEmailPayloadEncryptor,
    },
    {
      provide: OUTBOUND_EMAIL_PROVIDER,
      useExisting: SmtpOutboundEmailProvider,
    },
    {
      provide: OUTBOUND_EMAIL_DISPATCH_STORE,
      useExisting: PrismaOutboundEmailDispatchStore,
    },
    {
      provide: OUTBOUND_EMAIL_DELIVERY_STORE,
      useExisting: PrismaOutboundEmailDeliveryStore,
    },
    {
      provide: OutboundEmailTemplateRegistry,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        return new OutboundEmailTemplateRegistry([
          new IdentityPasswordResetEmailTemplate(configService),
          new IdentityEmailVerificationEmailTemplate(configService),
        ]);
      },
    },
  ],
  exports: [OUTBOUND_EMAIL_PAYLOAD_ENCRYPTOR, OutboundEmailTemplateRegistry],
})
export class OutboundEmailModule {}
