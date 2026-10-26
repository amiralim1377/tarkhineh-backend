import type { OutboundEmailContent } from '../ports/outbound-email-provider.port.js';
import { OutboundEmailTemplateError } from '../errors/outbound-email-template.error.js';
import type { OutboundEmailTemplate } from './outbound-email-template.js';

export interface RenderOutboundEmailTemplateInput {
  readonly templateKey: string;
  readonly payloadVersion: number;
  readonly payload: unknown;
}

const TEMPLATE_KEY_PATTERN = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/;

const MAX_TEMPLATE_KEY_LENGTH = 120;
const MAX_TEMPLATE_VERSION = 2_147_483_647;

export class OutboundEmailTemplateRegistry {
  private readonly templates = new Map<
    string,
    Map<number, OutboundEmailTemplate>
  >();

  constructor(definitions: readonly OutboundEmailTemplate[]) {
    for (const definition of definitions) {
      this.register(definition);
    }
  }

  async render(
    input: RenderOutboundEmailTemplateInput,
  ): Promise<OutboundEmailContent> {
    const { templateKey, payloadVersion, payload } = input;

    if (
      typeof templateKey !== 'string' ||
      templateKey.length > MAX_TEMPLATE_KEY_LENGTH ||
      !TEMPLATE_KEY_PATTERN.test(templateKey)
    ) {
      throw new OutboundEmailTemplateError('UNSUPPORTED_TEMPLATE');
    }

    const versions = this.templates.get(templateKey);

    if (!versions) {
      throw new OutboundEmailTemplateError('UNSUPPORTED_TEMPLATE');
    }

    if (
      !Number.isSafeInteger(payloadVersion) ||
      payloadVersion < 1 ||
      payloadVersion > MAX_TEMPLATE_VERSION
    ) {
      throw new OutboundEmailTemplateError('UNSUPPORTED_TEMPLATE_VERSION');
    }

    const template = versions.get(payloadVersion);

    if (!template) {
      throw new OutboundEmailTemplateError('UNSUPPORTED_TEMPLATE_VERSION');
    }

    let content: OutboundEmailContent;

    try {
      content = await template.render(payload);
    } catch (error: unknown) {
      if (error instanceof OutboundEmailTemplateError) {
        throw error;
      }

      // Never expose template implementation details or payload values.
      throw new OutboundEmailTemplateError('RENDER_FAILED');
    }

    this.validateRenderedContent(content);

    return content;
  }

  private register(definition: OutboundEmailTemplate): void {
    if (
      !definition.key ||
      definition.key.length > MAX_TEMPLATE_KEY_LENGTH ||
      !TEMPLATE_KEY_PATTERN.test(definition.key)
    ) {
      throw new TypeError('Outbound email template key is invalid.');
    }

    if (
      !Number.isSafeInteger(definition.version) ||
      definition.version < 1 ||
      definition.version > MAX_TEMPLATE_VERSION
    ) {
      throw new TypeError('Outbound email template version is invalid.');
    }

    if (typeof definition.render !== 'function') {
      throw new TypeError('Outbound email template renderer is invalid.');
    }

    let versions = this.templates.get(definition.key);

    if (!versions) {
      versions = new Map<number, OutboundEmailTemplate>();
      this.templates.set(definition.key, versions);
    }

    if (versions.has(definition.version)) {
      throw new Error('Duplicate outbound email template registration.');
    }

    versions.set(definition.version, definition);
  }

  private validateRenderedContent(content: OutboundEmailContent): void {
    if (
      !content ||
      typeof content !== 'object' ||
      !this.isValidHeaderValue(content.to, 1_000) ||
      !this.isValidHeaderValue(content.subject, 998) ||
      typeof content.text !== 'string' ||
      !content.text.trim() ||
      (content.html !== undefined &&
        (typeof content.html !== 'string' || !content.html.trim())) ||
      (content.replyTo !== undefined &&
        !this.isValidHeaderValue(content.replyTo, 1_000))
    ) {
      throw new OutboundEmailTemplateError('RENDER_FAILED');
    }
  }

  private isValidHeaderValue(
    value: unknown,
    maxLength: number,
  ): value is string {
    return (
      typeof value === 'string' &&
      value.trim().length > 0 &&
      value.length <= maxLength &&
      !/[\r\n]/.test(value)
    );
  }
}
