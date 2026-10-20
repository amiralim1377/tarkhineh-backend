import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, type Transporter } from 'nodemailer';

import type {
  OutboundEmailContent,
  OutboundEmailProvider,
  OutboundEmailProviderResult,
} from '../../application/ports/outbound-email-provider.port.js';
import {
  OutboundEmailProviderError,
  type OutboundEmailProviderFailureKind,
} from '../../application/errors/outbound-email-provider.error.js';

interface SmtpConfiguration {
  readonly host: string;
  readonly port: number;
  readonly secure: boolean;
  readonly username: string;
  readonly password: string;
  readonly from: string;
}

interface NodemailerFailureDetails {
  readonly code?: unknown;
  readonly responseCode?: unknown;
  readonly command?: unknown;
  readonly timeoutType?: unknown;
}

const CONNECTION_TIMEOUT_MS = 10_000;
const GREETING_TIMEOUT_MS = 10_000;
const SOCKET_TIMEOUT_MS = 30_000;

const AUTHENTICATION_OR_CONFIGURATION_CODES = new Set([
  'EAUTH',
  'ENOAUTH',
  'EOAUTH2',
  'ETLS',
  'EREQUIRETLS',
  'ECONFIG',
]);

const PERMANENT_FAILURE_CODES = new Set([
  'EENVELOPE',
  'EMAXRECIPIENTS',
  'EMESSAGE',
]);

const NETWORK_FAILURE_CODES = new Set([
  'ECONNECTION',
  'ETIMEDOUT',
  'EDNS',
  'ESOCKET',
  'ECONNREFUSED',
  'ECONNRESET',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'ENOTFOUND',
  'EAI_AGAIN',
]);

const SAFE_PRE_DATA_TIMEOUT_TYPES = new Set([
  'CONNECT_TIMEOUT',
  'GREETING_TIMEOUT',
  'UPGRADE_TIMEOUT',
]);

@Injectable()
export class SmtpOutboundEmailProvider
  implements OutboundEmailProvider, OnModuleDestroy
{
  private transporter: Transporter | null = null;
  private fromAddress: string | null = null;

  constructor(private readonly configService: ConfigService) {}

  async send(
    content: OutboundEmailContent,
  ): Promise<OutboundEmailProviderResult> {
    const { transporter, from } = this.getTransporter();

    try {
      const info = await transporter.sendMail({
        from,
        to: content.to,
        subject: content.subject,
        text: content.text,
        ...(content.html !== undefined ? { html: content.html } : {}),
        ...(content.replyTo !== undefined
          ? { replyTo: content.replyTo }
          : {}),
      });

      return {
        providerMessageId:
          typeof info.messageId === 'string' && info.messageId.trim()
            ? info.messageId
            : null,
      };
    } catch (error: unknown) {
      // Never expose the raw SMTP error or server response to callers.
      throw new OutboundEmailProviderError(
        this.classifyFailure(error),
      );
    }
  }

  onModuleDestroy(): void {
    this.transporter?.close();
    this.transporter = null;
    this.fromAddress = null;
  }

  private getTransporter(): {
    readonly transporter: Transporter;
    readonly from: string;
  } {
    if (this.transporter && this.fromAddress) {
      return {
        transporter: this.transporter,
        from: this.fromAddress,
      };
    }

    const configuration = this.readConfiguration();

    try {
      const transporter = createTransport({
        host: configuration.host,
        port: configuration.port,
        secure: configuration.secure,
        auth: {
          user: configuration.username,
          pass: configuration.password,
        },
        connectionTimeout: CONNECTION_TIMEOUT_MS,
        greetingTimeout: GREETING_TIMEOUT_MS,
        socketTimeout: SOCKET_TIMEOUT_MS,
      });

      this.transporter = transporter;
      this.fromAddress = configuration.from;

      return {
        transporter,
        from: configuration.from,
      };
    } catch {
      throw new OutboundEmailProviderError('NOT_READY');
    }
  }

  private readConfiguration(): SmtpConfiguration {
    const host = this.configService.get<string>('SMTP_HOST');
    const username = this.configService.get<string>('SMTP_USER');
    const password = this.configService.get<string>('SMTP_PASSWORD');
    const from = this.configService.get<string>('SMTP_FROM');

    const configuredPort =
      this.configService.get<number | string>('SMTP_PORT');
    const port =
      configuredPort === undefined || configuredPort === null
        ? 587
        : Number(configuredPort);

    const secureSetting =
      this.configService.get<string>('SMTP_SECURE');

    if (
      !host?.trim() ||
      !username?.trim() ||
      !password?.trim() ||
      !from?.trim() ||
      !Number.isInteger(port) ||
      port < 1 ||
      port > 65535 ||
      (secureSetting !== undefined &&
        secureSetting !== 'true' &&
        secureSetting !== 'false')
    ) {
      throw new OutboundEmailProviderError('NOT_READY');
    }

    return {
      host: host.trim(),
      port,
      secure:
        secureSetting === undefined
          ? port === 465
          : secureSetting === 'true',
      username: username.trim(),
      // Preserve the configured password exactly.
      password,
      from: from.trim(),
    };
  }

  private classifyFailure(
    error: unknown,
  ): OutboundEmailProviderFailureKind {
    if (typeof error !== 'object' || error === null) {
      return 'OUTCOME_UNKNOWN';
    }

    const details = error as NodemailerFailureDetails;

    const code =
      typeof details.code === 'string'
        ? details.code.toUpperCase()
        : '';

    const responseCode =
      typeof details.responseCode === 'number'
        ? details.responseCode
        : null;

    const command =
      typeof details.command === 'string'
        ? details.command.trim().toUpperCase()
        : '';

    const timeoutType =
      typeof details.timeoutType === 'string'
        ? details.timeoutType.toUpperCase()
        : '';

    // An explicit SMTP 4xx response confirms temporary rejection.
    if (
      responseCode !== null &&
      responseCode >= 400 &&
      responseCode < 500
    ) {
      return 'TEMPORARY_REJECTION';
    }

    // Authentication and local transport configuration need attention.
    // A temporary SMTP response above still takes precedence.
    if (AUTHENTICATION_OR_CONFIGURATION_CODES.has(code)) {
      return 'NOT_READY';
    }

    // An explicit SMTP 5xx response confirms rejection.
    if (
      responseCode !== null &&
      responseCode >= 500 &&
      responseCode < 600
    ) {
      return 'PERMANENT_REJECTION';
    }

    if (PERMANENT_FAILURE_CODES.has(code)) {
      return 'PERMANENT_REJECTION';
    }

    // These timeout phases occur before message transmission.
    if (
      code === 'ETIMEDOUT' &&
      SAFE_PRE_DATA_TIMEOUT_TYPES.has(timeoutType)
    ) {
      return 'TEMPORARY_REJECTION';
    }

    const failedBeforeMessageData =
      command === 'CONN' ||
      command === 'EHLO' ||
      command === 'HELO' ||
      command === 'STARTTLS' ||
      command === 'AUTH' ||
      command.startsWith('AUTH ') ||
      command === 'MAIL FROM' ||
      command === 'RCPT TO';

    // Retry network errors automatically only when the SMTP command
    // confirms the message body was not yet being transmitted.
    if (
      NETWORK_FAILURE_CODES.has(code) &&
      failedBeforeMessageData
    ) {
      return 'TEMPORARY_REJECTION';
    }

    // The message may have reached the Provider. Do not auto-retry.
    return 'OUTCOME_UNKNOWN';
  }
}
