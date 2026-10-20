export type OutboundEmailTemplateFailureKind =
  | 'UNSUPPORTED_TEMPLATE'
  | 'UNSUPPORTED_TEMPLATE_VERSION'
  | 'PAYLOAD_INVALID'
  | 'RENDER_FAILED';

const SAFE_MESSAGES: Record<OutboundEmailTemplateFailureKind, string> = {
  UNSUPPORTED_TEMPLATE: 'Outbound email template is not supported.',
  UNSUPPORTED_TEMPLATE_VERSION:
    'Outbound email template version is not supported.',
  PAYLOAD_INVALID: 'Outbound email template payload is invalid.',
  RENDER_FAILED: 'Outbound email template rendering failed.',
};

export class OutboundEmailTemplateError extends Error {
  constructor(readonly kind: OutboundEmailTemplateFailureKind) {
    super(SAFE_MESSAGES[kind]);
    this.name = 'OutboundEmailTemplateError';
  }
}
