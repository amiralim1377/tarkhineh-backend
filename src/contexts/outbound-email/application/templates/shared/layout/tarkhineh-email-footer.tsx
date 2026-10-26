import { Section, Text } from 'react-email';
import type { CSSProperties } from 'react';

export interface TarkhinehEmailFooterProps {
  /**
   * Short message displayed at the bottom of the email.
   */
  readonly message?: string;
}

const DEFAULT_MESSAGE = 'This is an automated email from Tarkhineh.';

const styles: Record<string, CSSProperties> = {
  section: {
    backgroundColor: '#F9F9F9',
    borderTop: '1px solid #E1E1E1',
    padding: '20px 24px',
    textAlign: 'center',
  },

  text: {
    color: '#757575',
    fontFamily: 'Estedad, Tahoma, Arial, sans-serif',
    fontSize: '12px',
    fontWeight: '400',
    lineHeight: '1.8',
    margin: '0',
    textAlign: 'center',
  },
};

export function TarkhinehEmailFooter({
  message = DEFAULT_MESSAGE,
}: TarkhinehEmailFooterProps) {
  return (
    <Section style={styles.section}>
      <Text style={styles.text}>{message}</Text>
    </Section>
  );
}
