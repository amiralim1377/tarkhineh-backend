import type { ConfigService } from '@nestjs/config';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createTransport } from 'nodemailer';

import type { OutboundEmailContent } from '../../application/ports/outbound-email-provider.port.js';
import { SmtpOutboundEmailProvider } from './smtp-outbound-email.provider.js';

vi.mock('nodemailer', () => ({
  createTransport: vi.fn(),
}));

const smtpSettings: Record<string, unknown> = {
  SMTP_HOST: 'smtp.example.test',
  SMTP_PORT: 587,
  SMTP_SECURE: 'false',
  SMTP_USER: 'smtp-user',
  SMTP_PASSWORD: 'test-password',
  SMTP_FROM: 'Tarkhineh <no-reply@example.test>',
};

const content: OutboundEmailContent = {
  to: 'recipient@example.test',
  subject: 'Integration-independent SMTP test',
  text: 'Test message',
  html: '<p>Test message</p>',
  replyTo: 'support@example.test',
};

function createHarness(
  overrides: Record<string, unknown> = {},
) {
  const settings = {
    ...smtpSettings,
    ...overrides,
  };

  const get = vi.fn((key: string) => settings[key]);

  const configService = {
    get,
  } as unknown as ConfigService;

  const sendMail = vi
    .fn()
    .mockResolvedValue({
      messageId: '<smtp-message-id@example.test>',
    });

  const close = vi.fn();

  const transporter = {
    sendMail,
    close,
  };

  vi.mocked(createTransport).mockReturnValue(
    transporter as unknown as ReturnType<typeof createTransport>,
  );

  const provider = new SmtpOutboundEmailProvider(configService);

  return {
    provider,
    get,
    sendMail,
    close,
  };
}

function smtpFailure(
  properties: Record<string, unknown>,
): Error {
  return Object.assign(
    new Error('Sensitive SMTP server details must not escape'),
    properties,
  );
}

describe('SmtpOutboundEmailProvider', () => {
  beforeEach(() => {
    vi.mocked(createTransport).mockReset();
  });

  it('sends an email using SMTP and returns the Provider message ID', async () => {
    const { provider, sendMail } = createHarness();

    const result = await provider.send(content);

    expect(createTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        host: 'smtp.example.test',
        port: 587,
        secure: false,
        auth: {
          user: 'smtp-user',
          pass: 'test-password',
        },
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 30_000,
      }),
    );

    expect(sendMail).toHaveBeenCalledWith({
      from: 'Tarkhineh <no-reply@example.test>',
      to: content.to,
      subject: content.subject,
      text: content.text,
      html: content.html,
      replyTo: content.replyTo,
    });

    expect(result).toEqual({
      providerMessageId: '<smtp-message-id@example.test>',
    });
  });

  it('uses secure SMTP automatically when port 465 is configured', async () => {
    const { provider } = createHarness({
      SMTP_PORT: 465,
      SMTP_SECURE: undefined,
    });

    await provider.send(content);

    expect(createTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        port: 465,
        secure: true,
      }),
    );
  });

  it('returns null when Nodemailer supplies no usable message ID', async () => {
    const { provider, sendMail } = createHarness();

    sendMail.mockResolvedValueOnce({
      messageId: ' ',
    });

    await expect(provider.send(content)).resolves.toEqual({
      providerMessageId: null,
    });
  });

  it('omits optional fields when they are not supplied', async () => {
    const { provider, sendMail } = createHarness();

    await provider.send({
      to: 'recipient@example.test',
      subject: 'Plain-text email',
      text: 'Plain text only',
    });

    expect(sendMail).toHaveBeenCalledWith({
      from: 'Tarkhineh <no-reply@example.test>',
      to: 'recipient@example.test',
      subject: 'Plain-text email',
      text: 'Plain text only',
    });
  });

  it('does not create a transport when SMTP configuration is incomplete', async () => {
    const { provider } = createHarness({
      SMTP_HOST: undefined,
    });

    await expect(provider.send(content)).rejects.toMatchObject({
      name: 'OutboundEmailProviderError',
      kind: 'NOT_READY',
      message: 'Outbound email provider failure: NOT_READY',
    });

    expect(createTransport).not.toHaveBeenCalled();
  });

  it('classifies an explicit SMTP 4xx rejection as temporary', async () => {
    const { provider, sendMail } = createHarness();

    sendMail.mockRejectedValueOnce(
      smtpFailure({
        code: 'ESMTP',
        command: 'RCPT TO',
        responseCode: 450,
      }),
    );

    await expect(provider.send(content)).rejects.toMatchObject({
      name: 'OutboundEmailProviderError',
      kind: 'TEMPORARY_REJECTION',
    });
  });

  it('classifies an explicit SMTP 5xx rejection as permanent', async () => {
    const { provider, sendMail } = createHarness();

    sendMail.mockRejectedValueOnce(
      smtpFailure({
        code: 'ESMTP',
        command: 'RCPT TO',
        responseCode: 550,
      }),
    );

    await expect(provider.send(content)).rejects.toMatchObject({
      name: 'OutboundEmailProviderError',
      kind: 'PERMANENT_REJECTION',
    });
  });

  it('classifies invalid SMTP credentials as NOT_READY without exposing raw details', async () => {
    const { provider, sendMail } = createHarness();

    sendMail.mockRejectedValueOnce(
      smtpFailure({
        code: 'EAUTH',
        command: 'AUTH PLAIN',
        responseCode: 535,
      }),
    );

    await expect(provider.send(content)).rejects.toMatchObject({
      name: 'OutboundEmailProviderError',
      kind: 'NOT_READY',
      message: 'Outbound email provider failure: NOT_READY',
    });
  });

  it('classifies a connection failure before message transmission as temporary', async () => {
    const { provider, sendMail } = createHarness();

    sendMail.mockRejectedValueOnce(
      smtpFailure({
        code: 'ECONNECTION',
        command: 'CONN',
      }),
    );

    await expect(provider.send(content)).rejects.toMatchObject({
      name: 'OutboundEmailProviderError',
      kind: 'TEMPORARY_REJECTION',
    });
  });

  it('classifies a connection timeout before transmission as temporary', async () => {
    const { provider, sendMail } = createHarness();

    sendMail.mockRejectedValueOnce(
      smtpFailure({
        code: 'ETIMEDOUT',
        timeoutType: 'CONNECT_TIMEOUT',
      }),
    );

    await expect(provider.send(content)).rejects.toMatchObject({
      name: 'OutboundEmailProviderError',
      kind: 'TEMPORARY_REJECTION',
    });
  });

  it('classifies a connection loss during final message transmission as unknown', async () => {
    const { provider, sendMail } = createHarness();

    sendMail.mockRejectedValueOnce(
      smtpFailure({
        code: 'ECONNECTION',
        command: 'DATAEND',
      }),
    );

    await expect(provider.send(content)).rejects.toMatchObject({
      name: 'OutboundEmailProviderError',
      kind: 'OUTCOME_UNKNOWN',
      message: 'Outbound email provider failure: OUTCOME_UNKNOWN',
    });
  });

  it('classifies unrecognized send failures as unknown without leaking details', async () => {
    const { provider, sendMail } = createHarness();

    sendMail.mockRejectedValueOnce(
      new Error('Sensitive provider response must not escape'),
    );

    await expect(provider.send(content)).rejects.toMatchObject({
      name: 'OutboundEmailProviderError',
      kind: 'OUTCOME_UNKNOWN',
      message: 'Outbound email provider failure: OUTCOME_UNKNOWN',
    });
  });

  it('reuses the transporter and closes it during module shutdown', async () => {
    const { provider, close } = createHarness();

    await provider.send(content);
    await provider.send({
      ...content,
      to: 'another-recipient@example.test',
    });

    expect(createTransport).toHaveBeenCalledOnce();

    provider.onModuleDestroy();

    expect(close).toHaveBeenCalledOnce();
  });
});
