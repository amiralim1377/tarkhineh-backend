import { Body, Container, Head, Html, Preview, Section } from 'react-email';
import type { CSSProperties, ReactNode } from 'react';

import { TarkhinehEmailFooter } from './tarkhineh-email-footer.js';
import { TarkhinehEmailHeader } from './tarkhineh-email-header.js';

export interface EmailLayoutProps {
  /**
   * Short preview shown by email clients beside the subject.
   */
  readonly previewText: string;

  /**
   * An absolute HTTPS URL to a publicly accessible brand logo.
   */
  readonly logoUrl: string;

  /**
   * Email content specific to the individual template.
   */
  readonly children: ReactNode;

  /**
   * Optional footer message, shared across email templates by default.
   */
  readonly footerMessage?: string;

  readonly lang?: string;
  readonly dir?: 'ltr' | 'rtl';
}

const styles: Record<string, CSSProperties> = {
  body: {
    backgroundColor: '#EDEDED',
    direction: 'rtl',
    fontFamily: '"Estedad", Tahoma, Arial, sans-serif',
    margin: '0',
    padding: '24px 12px',
    textAlign: 'right',
  },

  container: {
    width: '100%',
    maxWidth: '600px',
    margin: '0 auto',
    backgroundColor: '#FFFFFF',
  },

  content: {
    backgroundColor: '#FFFFFF',
    direction: 'rtl',
    padding: '32px 24px',
    textAlign: 'right',
  },
};

export function EmailLayout({
  previewText,
  logoUrl,
  children,
  footerMessage,
  lang = 'fa',
  dir = 'rtl',
}: EmailLayoutProps) {
  return (
    <Html lang={lang} dir={dir}>
      <Head />

      <Preview>{previewText}</Preview>

      <Body dir={dir} style={styles.body}>
        <Container style={styles.container}>
          <TarkhinehEmailHeader logoUrl={logoUrl} />

          <Section dir={dir} style={styles.content}>
            {children}
          </Section>

          <TarkhinehEmailFooter message={footerMessage} />
        </Container>
      </Body>
    </Html>
  );
}
