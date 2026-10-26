import { Img, Section } from 'react-email';
import type { CSSProperties } from 'react';

export interface TarkhinehEmailHeaderProps {
  /**
   * An absolute HTTPS URL to the publicly hosted white Tarkhineh logo.
   */
  readonly logoUrl: string;
}

const styles: Record<string, CSSProperties> = {
  section: {
    backgroundColor: '#417F56',
    padding: '20px 24px',
    textAlign: 'center',
  },

  logo: {
    display: 'block',
    width: '150px',
    height: '51px',
    margin: '0 auto',
    border: '0',
    outline: 'none',
    textDecoration: 'none',
  },
};

export function TarkhinehEmailHeader({ logoUrl }: TarkhinehEmailHeaderProps) {
  return (
    <Section style={styles.section}>
      <Img
        src={logoUrl}
        alt="ترخینه | رستوران‌های زنجیره‌ای"
        width={150}
        height={51}
        style={styles.logo}
      />
    </Section>
  );
}
