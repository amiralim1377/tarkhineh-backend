export const OUTBOUND_EMAIL_TEMPLATES = {
  MEMBERSHIP_INVITATION: {
    key: 'organization.membership-invitation',
    version: 1,
  },
} as const;

export type OutboundEmailTemplateDefinition =
  (typeof OUTBOUND_EMAIL_TEMPLATES)[keyof typeof OUTBOUND_EMAIL_TEMPLATES];

export type OutboundEmailTemplateKey = OutboundEmailTemplateDefinition['key'];
