import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { PrismaModule } from '../../prisma/prisma.module.js';
import { OUTBOUND_EMAIL_PAYLOAD_ENCRYPTOR } from './application/ports/outbound-email-payload-encryptor.port.js';
import { OUTBOUND_EMAIL_PROVIDER } from './application/ports/outbound-email-provider.port.js';
import { OUTBOUND_EMAIL_DISPATCH_STORE } from './application/ports/outbound-email-dispatch-store.port.js';
import { OUTBOUND_EMAIL_DELIVERY_STORE } from './application/ports/outbound-email-delivery-store.port.js';
import { OutboundEmailTemplateRegistry } from './application/templates/outbound-email-template.registry.js';
import { IdentityPasswordResetEmailTemplate } from './application/templates/identity/password-reset/password-reset.template.js';
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
import { IdentityEmailVerificationEmailTemplate } from './application/templates/identity/email-verification/email-verification.template.js';
import { PasswordChangedEmailTemplate } from './application/templates/identity/password-changed/password-changed.template.js';
import { IdentityWelcomeEmailTemplate } from './application/templates/identity/welcome/welcome.template.js';
import { OUTBOUND_EMAIL_ENQUEUE } from './contracts/outbound-email-enqueue.contract.js';
import { OutboundEmailEnqueueService } from './application/services/outbound-email-enqueue.service.js';
import { OUTBOUND_EMAIL_REQUEST_FINGERPRINTER } from './application/ports/outbound-email-request-fingerprinter.port.js';
import { HmacOutboundEmailRequestFingerprinter } from './infrastructure/security/hmac-outbound-email-request-fingerprinter.js';
import { PrismaOutboundEmailMessageStore } from './infrastructure/persistence/prisma-outbound-email-message.store.js';
import { OUTBOUND_EMAIL_MESSAGE_STORE } from './application/ports/outbound-email-message-store.port.js';
import { MembershipInvitationEmailTemplate } from './application/templates/organization/membership-invitation/membership-invitation.template.js';

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
    OutboundEmailEnqueueService,
    PrismaOutboundEmailMessageStore,
    HmacOutboundEmailRequestFingerprinter,
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
          new PasswordChangedEmailTemplate(configService),
          new IdentityWelcomeEmailTemplate(configService),
          new MembershipInvitationEmailTemplate(configService),
        ]);
      },
    },
    {
      provide: OUTBOUND_EMAIL_ENQUEUE,
      useExisting: OutboundEmailEnqueueService,
    },
    {
      provide: OUTBOUND_EMAIL_MESSAGE_STORE,
      useExisting: PrismaOutboundEmailMessageStore,
    },
    {
      provide: OUTBOUND_EMAIL_REQUEST_FINGERPRINTER,
      useExisting: HmacOutboundEmailRequestFingerprinter,
    },
  ],
  exports: [
    OUTBOUND_EMAIL_PAYLOAD_ENCRYPTOR,
    OutboundEmailTemplateRegistry,
    OUTBOUND_EMAIL_ENQUEUE,
  ],
})
export class OutboundEmailModule {}
