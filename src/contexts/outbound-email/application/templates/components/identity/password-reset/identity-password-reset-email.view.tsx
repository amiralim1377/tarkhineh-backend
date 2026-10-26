import { Button, Heading, Hr, Section, Text } from 'react-email';
import type { CSSProperties } from 'react';

import { EmailLayout } from '../../layout/email-layout.js';

export interface IdentityPasswordResetEmailViewProps {
  /**
   * A validated password-reset URL.
   */
  readonly resetUrl: string;

  /**
   * An absolute HTTPS URL to the publicly hosted brand logo.
   */
  readonly logoUrl: string;
}

const styles: Record<string, CSSProperties> = {
  eyebrow: {
    color: '#396F4B',
    fontFamily: 'Estedad, Tahoma, Arial, sans-serif',
    fontSize: '11px',
    fontWeight: '700',
    letterSpacing: '1.2px',
    lineHeight: '1.6',
    margin: '0 0 12px',
  },

  heading: {
    color: '#353535',
    fontFamily: 'Estedad, Tahoma, Arial, sans-serif',
    fontSize: '26px',
    fontWeight: '700',
    lineHeight: '1.4',
    margin: '0 0 20px',
  },

  paragraph: {
    color: '#535353',
    fontFamily: 'Estedad, Tahoma, Arial, sans-serif',
    fontSize: '15px',
    fontWeight: '400',
    lineHeight: '1.8',
    margin: '0 0 16px',
  },

  buttonSection: {
    padding: '10px 0 22px',
  },

  button: {
    backgroundColor: '#417F56',
    borderRadius: '6px',
    color: '#FFFFFF',
    display: 'inline-block',
    fontFamily: 'Estedad, Tahoma, Arial, sans-serif',
    fontSize: '15px',
    fontWeight: '700',
    lineHeight: '1.5',
    padding: '14px 24px',
    textAlign: 'center',
    textDecoration: 'none',
  },

  smallText: {
    color: '#757575',
    fontFamily: 'Estedad, Tahoma, Arial, sans-serif',
    fontSize: '13px',
    fontWeight: '400',
    lineHeight: '1.8',
    margin: '0 0 12px',
  },

  divider: {
    borderColor: '#EDEDED',
    margin: '8px 0 20px',
  },

  fallbackUrl: {
    color: '#417F56',
    fontFamily: 'Tahoma, Arial, sans-serif',
    fontSize: '12px',
    lineHeight: '1.8',
    margin: '0 0 18px',
    overflowWrap: 'anywhere',
  },
};

export function IdentityPasswordResetEmailView({
  resetUrl,
  logoUrl,
}: IdentityPasswordResetEmailViewProps) {
  return (
    <EmailLayout
      previewText="Reset your Tarkhineh password using the secure link in this email."
      logoUrl={logoUrl}
      footerMessage="This is an automated security email from Tarkhineh."
      lang="en"
      dir="ltr"
    >
      <Text style={styles.eyebrow}>ACCOUNT SECURITY</Text>

      <Heading as="h1" style={styles.heading}>
        Reset your password
      </Heading>

      <Text style={styles.paragraph}>Hello,</Text>

      <Text style={styles.paragraph}>
        We received a request to reset your Tarkhineh password. Use the button
        below to choose a new password.
      </Text>

      <Section style={styles.buttonSection}>
        <Button href={resetUrl} style={styles.button}>
          Reset password
        </Button>
      </Section>

      <Text style={styles.smallText}>
        If you did not request a password reset, you can safely ignore this
        email. Your password will not change unless you complete the reset
        process.
      </Text>

      <Hr style={styles.divider} />

      <Text style={styles.smallText}>
        If the button does not work, copy the following link into your browser:
      </Text>

      <Text style={styles.fallbackUrl}>{resetUrl}</Text>

      <Text style={styles.smallText}>
        For your security, this link expires automatically. If it has expired,
        request a new password-reset email.
      </Text>
    </EmailLayout>
  );
}
