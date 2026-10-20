import { describe, expect, it, vi } from 'vitest';

import type { OutboundEmailContent } from '../ports/outbound-email-provider.port.js';
import { OutboundEmailTemplateError } from '../errors/outbound-email-template.error.js';
import type { OutboundEmailTemplate } from './outbound-email-template.js';
import { OutboundEmailTemplateRegistry } from './outbound-email-template.registry.js';

const validContent: OutboundEmailContent = {
  to: 'recipient@example.test',
  subject: 'Welcome',
  text: 'Welcome to Tarkhineh.',
  html: '<p>Welcome to Tarkhineh.</p>',
};

function createTemplate(
  options: {
    readonly key?: string;
    readonly version?: number;
    readonly render?: (payload: unknown) => OutboundEmailContent;
  } = {},
): OutboundEmailTemplate {
  return {
    key: options.key ?? 'identity.example',
    version: options.version ?? 1,
    render: options.render ?? vi.fn().mockReturnValue(validContent),
  };
}

function createRegistry(
  templates: readonly OutboundEmailTemplate[] = [createTemplate()],
): OutboundEmailTemplateRegistry {
  return new OutboundEmailTemplateRegistry(templates);
}

describe('OutboundEmailTemplateRegistry', () => {
  it('renders a registered template version', () => {
    const render = vi.fn().mockReturnValue(validContent);
    const registry = createRegistry([
      createTemplate({ render }),
    ]);

    const payload = { userName: 'Test User' };

    const result = registry.render({
      templateKey: 'identity.example',
      payloadVersion: 1,
      payload,
    });

    expect(result).toEqual(validContent);
    expect(render).toHaveBeenCalledWith(payload);
  });

  it('supports multiple versions of the same template key', () => {
    const versionOne = createTemplate({
      version: 1,
      render: vi.fn().mockReturnValue({
        ...validContent,
        subject: 'Version one',
      }),
    });

    const versionTwo = createTemplate({
      version: 2,
      render: vi.fn().mockReturnValue({
        ...validContent,
        subject: 'Version two',
      }),
    });

    const registry = createRegistry([versionOne, versionTwo]);

    expect(
      registry.render({
        templateKey: 'identity.example',
        payloadVersion: 1,
        payload: {},
      }).subject,
    ).toBe('Version one');

    expect(
      registry.render({
        templateKey: 'identity.example',
        payloadVersion: 2,
        payload: {},
      }).subject,
    ).toBe('Version two');
  });

  it('rejects an unregistered template key', () => {
    const registry = createRegistry();

    expect(() =>
      registry.render({
        templateKey: 'identity.unknown',
        payloadVersion: 1,
        payload: {},
      }),
    ).toThrowError(
      expect.objectContaining({
        name: 'OutboundEmailTemplateError',
        kind: 'UNSUPPORTED_TEMPLATE',
      }),
    );
  });

  it('rejects an unsupported template version', () => {
    const registry = createRegistry();

    expect(() =>
      registry.render({
        templateKey: 'identity.example',
        payloadVersion: 2,
        payload: {},
      }),
    ).toThrowError(
      expect.objectContaining({
        name: 'OutboundEmailTemplateError',
        kind: 'UNSUPPORTED_TEMPLATE_VERSION',
      }),
    );
  });

  it('rejects an invalid version number', () => {
    const registry = createRegistry();

    expect(() =>
      registry.render({
        templateKey: 'identity.example',
        payloadVersion: 0,
        payload: {},
      }),
    ).toThrowError(
      expect.objectContaining({
        kind: 'UNSUPPORTED_TEMPLATE_VERSION',
      }),
    );
  });

  it('rejects duplicate registrations of the same key and version', () => {
    expect(
      () =>
        createRegistry([
          createTemplate(),
          createTemplate(),
        ]),
    ).toThrow('Duplicate outbound email template registration.');
  });

  it('rejects an invalid template key during registration', () => {
    expect(() =>
      createRegistry([
        createTemplate({ key: 'Invalid Key' }),
      ]),
    ).toThrow('Outbound email template key is invalid.');
  });

  it('rejects an invalid template version during registration', () => {
    expect(() =>
      createRegistry([
        createTemplate({ version: 0 }),
      ]),
    ).toThrow('Outbound email template version is invalid.');
  });

  it('preserves a known payload validation error', () => {
    const registry = createRegistry([
      createTemplate({
        render: () => {
          throw new OutboundEmailTemplateError('PAYLOAD_INVALID');
        },
      }),
    ]);

    expect(() =>
      registry.render({
        templateKey: 'identity.example',
        payloadVersion: 1,
        payload: { unexpected: true },
      }),
    ).toThrowError(
      expect.objectContaining({
        name: 'OutboundEmailTemplateError',
        kind: 'PAYLOAD_INVALID',
      }),
    );
  });

  it('does not expose an unexpected renderer error', () => {
    const registry = createRegistry([
      createTemplate({
        render: () => {
          throw new Error('Sensitive internal details');
        },
      }),
    ]);

    try {
      registry.render({
        templateKey: 'identity.example',
        payloadVersion: 1,
        payload: {},
      });

      throw new Error('Expected template rendering to fail');
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(OutboundEmailTemplateError);
      expect(error).toMatchObject({
        kind: 'RENDER_FAILED',
        message: 'Outbound email template rendering failed.',
      });
      expect((error as Error).message).not.toContain(
        'Sensitive internal details',
      );
    }
  });

  it('rejects invalid rendered content before the Provider can receive it', () => {
    const registry = createRegistry([
      createTemplate({
        render: () => ({
          ...validContent,
          subject: 'Invalid\r\nBcc: attacker@example.test',
        }),
      }),
    ]);

    expect(() =>
      registry.render({
        templateKey: 'identity.example',
        payloadVersion: 1,
        payload: {},
      }),
    ).toThrowError(
      expect.objectContaining({
        kind: 'RENDER_FAILED',
      }),
    );
  });

  it('rejects empty message bodies', () => {
    const registry = createRegistry([
      createTemplate({
        render: () => ({
          ...validContent,
          text: '   ',
        }),
      }),
    ]);

    expect(() =>
      registry.render({
        templateKey: 'identity.example',
        payloadVersion: 1,
        payload: {},
      }),
    ).toThrowError(
      expect.objectContaining({
        kind: 'RENDER_FAILED',
      }),
    );
  });
});
