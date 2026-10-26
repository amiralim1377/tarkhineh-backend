import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from 'react-email';
import type { CSSProperties } from 'react';

export interface IdentityPasswordResetEmailViewProps {
  readonly resetUrl: string;
}

const styles: Record<string, CSSProperties> = {
  body: {
    backgroundColor: '#f3f5f7',
    color: '#263238',
    fontFamily: 'Arial, Helvetica, sans-serif',
    margin: '0',
    padding: '32px 12px',
  },

  container: {
    backgroundColor: '#ffffff',
    border: '1px solid #e5e9ed',
    borderRadius: '12px',
    margin: '0 auto',
    maxWidth: '560px',
    overflow: 'hidden',
  },

  header: {
    backgroundColor: '#174c3c',
    padding: '22px 32px',
  },

  brand: {
    color: '#ffffff',
    fontSize: '22px',
    fontWeight: '700',
    letterSpacing: '0.3px',
    margin: '0',
  },

  content: {
    padding: '36px 32px 28px',
  },

  eyebrow: {
    color: '#187653',
    fontSize: '11px',
    fontWeight: '700',
    letterSpacing: '1.5px',
    margin: '0 0 12px',
  },

  heading: {
    color: '#182b25',
    fontSize: '27px',
    fontWeight: '700',
    lineHeight: '1.35',
    margin: '0 0 20px',
  },

  paragraph: {
    color: '#52615b',
    fontSize: '15px',
    lineHeight: '1.8',
    margin: '0 0 16px',
  },

  buttonSection: {
    padding: '12px 0 22px',
  },

  button: {
    backgroundColor: '#187653',
    borderRadius: '7px',
    color: '#ffffff',
    display: 'inline-block',
    fontSize: '15px',
    fontWeight: '700',
    padding: '14px 24px',
    textAlign: 'center',
    textDecoration: 'none',
  },

  smallText: {
    color: '#687770',
    fontSize: '13px',
    lineHeight: '1.7',
    margin: '0 0 12px',
  },

  divider: {
    borderColor: '#e8ece9',
    margin: '8px 0 20px',
  },

  fallbackUrl: {
    color: '#187653',
    fontSize: '12px',
    lineHeight: '1.7',
    overflowWrap: 'anywhere',
    margin: '0 0 18px',
  },

  footer: {
    backgroundColor: '#f8faf9',
    borderTop: '1px solid #e8ece9',
    padding: '18px 32px',
  },

  footerText: {
    color: '#7a8781',
    fontSize: '11px',
    lineHeight: '1.7',
    margin: '0',
    textAlign: 'center',
  },
};

export function IdentityPasswordResetEmailView({
  resetUrl,
}: IdentityPasswordResetEmailViewProps) {
  return (
    <Html lang="en" dir="ltr">
      <Head />

      <Preview>
        Reset your Tarkhineh password using the secure link in this email.
      </Preview>

      <Body style={styles.body}>
        <Container style={styles.container}>
          {/* Brand header */}
          <Section style={styles.header}>
            <Text style={styles.brand}>Tarkhineh</Text>
          </Section>

          {/* Main content */}
          <Section style={styles.content}>
            <Text style={styles.eyebrow}>ACCOUNT SECURITY</Text>

            <Heading style={styles.heading}>Reset your password</Heading>

            <Text style={styles.paragraph}>Hello,</Text>

            <Text style={styles.paragraph}>
              We received a request to reset your Tarkhineh password. Use the
              button below to choose a new password.
            </Text>

            {/* Primary action */}
            <Section style={styles.buttonSection}>
              <Button href={resetUrl} style={styles.button}>
                Reset password
              </Button>
            </Section>

            <Text style={styles.smallText}>
              If you did not request a password reset, you can safely ignore
              this email.
            </Text>

            <Hr style={styles.divider} />

            {/* Fallback action */}
            <Text style={styles.smallText}>
              If the button does not work, copy this link into your browser:
            </Text>

            <Text style={styles.fallbackUrl}>{resetUrl}</Text>

            <Text style={styles.smallText}>
              For your security, this link expires automatically.
            </Text>
          </Section>

          {/* Footer */}
          <Section style={styles.footer}>
            <Text style={styles.footerText}>
              This is an automated security email from Tarkhineh.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
