export const OUTBOUND_EMAIL_PROVIDER = Symbol(
  'OUTBOUND_EMAIL_PROVIDER',
);

export interface OutboundEmailContent {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
  readonly html?: string;
  readonly replyTo?: string;
}

export interface OutboundEmailProviderResult {
  /**
   * Provider's identifier when one is available.
   * A successful result means provider acceptance, not inbox delivery.
   */
  readonly providerMessageId: string | null;
}

export interface OutboundEmailProvider {
  send(
    content: OutboundEmailContent,
  ): Promise<OutboundEmailProviderResult>;
}
