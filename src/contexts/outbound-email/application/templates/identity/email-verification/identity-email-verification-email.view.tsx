import { Button, Heading, Hr, Section, Text } from 'react-email';
import type { CSSProperties } from 'react';

import { EmailLayout } from '../../shared/layout/email-layout.js';

export interface IdentityEmailVerificationEmailViewProps {
  /**
   * A validated email-verification URL.
   */
  readonly verificationUrl: string;

  /**
   * An absolute HTTPS URL to the publicly hosted brand logo.
   */
  readonly logoUrl: string;
}

const styles: Record<string, CSSProperties> = {
  eyebrow: {
    color: '#396F4B',
    fontFamily: '"Estedad", Tahoma, Arial, sans-serif',
    fontSize: '12px',
    fontWeight: '700',
    lineHeight: '1.8',
    margin: '0 0 12px',
    textAlign: 'right',
  },

  heading: {
    color: '#353535',
    fontFamily: '"Estedad", Tahoma, Arial, sans-serif',
    fontSize: '26px',
    fontWeight: '700',
    lineHeight: '1.6',
    margin: '0 0 20px',
    textAlign: 'right',
  },

  paragraph: {
    color: '#535353',
    fontFamily: '"Estedad", Tahoma, Arial, sans-serif',
    fontSize: '15px',
    fontWeight: '400',
    lineHeight: '2',
    margin: '0 0 16px',
    textAlign: 'right',
  },

  buttonSection: {
    paddingTop: '10px',
    paddingBottom: '22px',
    textAlign: 'right',
  },

  button: {
    backgroundColor: '#417F56',
    borderRadius: '6px',
    color: '#FFFFFF',
    display: 'inline-block',
    fontFamily: '"Estedad", Tahoma, Arial, sans-serif',
    fontSize: '15px',
    fontWeight: '700',
    lineHeight: '1.8',
    padding: '12px 24px',
    textAlign: 'center',
    textDecoration: 'none',
  },

  smallText: {
    color: '#757575',
    fontFamily: '"Estedad", Tahoma, Arial, sans-serif',
    fontSize: '13px',
    fontWeight: '400',
    lineHeight: '2',
    margin: '0 0 12px',
    textAlign: 'right',
  },

  divider: {
    borderColor: '#EDEDED',
    margin: '8px 0 20px',
  },

  fallbackUrl: {
    color: '#417F56',
    direction: 'ltr',
    fontFamily: 'Tahoma, Arial, sans-serif',
    fontSize: '12px',
    lineHeight: '1.8',
    margin: '0 0 18px',
    overflowWrap: 'anywhere',
    textAlign: 'left',
  },
};

export function IdentityEmailVerificationEmailView({
  verificationUrl,
  logoUrl,
}: IdentityEmailVerificationEmailViewProps) {
  return (
    <EmailLayout
      previewText="برای تکمیل ثبت‌نام، نشانی ایمیل خود را تأیید کنید."
      logoUrl={logoUrl}
      footerMessage="این ایمیل به‌صورت خودکار از طرف ترخینه ارسال شده است."
      lang="fa"
      dir="rtl"
    >
      <Text style={styles.eyebrow}>تأیید حساب کاربری</Text>

      <Heading as="h1" style={styles.heading}>
        به ترخینه خوش آمدید
      </Heading>

      <Text style={styles.paragraph}>سلام،</Text>

      <Text style={styles.paragraph}>
        از ثبت‌نام شما در ترخینه سپاسگزاریم. برای تکمیل ثبت‌نام و تأیید نشانی
        ایمیل خود، روی دکمه زیر کلیک کنید.
      </Text>

      <Section style={styles.buttonSection}>
        <Button href={verificationUrl} style={styles.button}>
          تأیید نشانی ایمیل
        </Button>
      </Section>

      <Text style={styles.smallText}>
        اگر شما درخواست ثبت‌نام در ترخینه را نداده‌اید، می‌توانید این ایمیل را
        نادیده بگیرید.
      </Text>

      <Hr style={styles.divider} />

      <Text style={styles.smallText}>
        اگر دکمه بالا کار نمی‌کند، لینک زیر را کپی کنید و در مرورگر خود قرار
        دهید:
      </Text>

      <Text style={styles.fallbackUrl}>{verificationUrl}</Text>

      <Text style={styles.smallText}>
        برای حفظ امنیت حساب شما، لینک تأیید پس از مدت مشخصی منقضی می‌شود. اگر
        لینک منقضی شده است، فرایند تأیید ایمیل را دوباره آغاز کنید.
      </Text>
    </EmailLayout>
  );
}
