import type { OutboundEmailContent } from '../ports/outbound-email-provider.port.js';

/**
 * A template must validate its payload before rendering.
 *
 * Invalid payloads must throw OutboundEmailTemplateError with
 * kind PAYLOAD_INVALID. Implementations must escape untrusted values
 * before inserting them into HTML.
 */
export interface OutboundEmailTemplate {
  readonly key: string;
  readonly version: number;

  render(payload: unknown): OutboundEmailContent;
}
