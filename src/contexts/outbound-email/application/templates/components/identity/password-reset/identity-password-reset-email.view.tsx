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
    fontFamily: '"Estedad", Tahoma, Arial, sans-serif',
    fontSize: '12px',
    fontWeight: '700',
    lineHeight: '1.8',
    margin: '0 0 12px',
  },

  heading: {
    color: '#353535',
    fontFamily: '"Estedad", Tahoma, Arial, sans-serif',
    fontSize: '26px',
    fontWeight: '700',
    lineHeight: '1.6',
    margin: '0 0 20px',
  },

  paragraph: {
    color: '#535353',
    fontFamily: '"Estedad", Tahoma, Arial, sans-serif',
    fontSize: '15px',
    fontWeight: '400',
    lineHeight: '2',
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

export function IdentityPasswordResetEmailView({
  resetUrl,
  logoUrl,
}: IdentityPasswordResetEmailViewProps) {
  return (
    <EmailLayout
      previewText="برای امنیت حساب کاربری خود، رمز عبورتان را بازیابی کنید."
      logoUrl={logoUrl}
      footerMessage="این ایمیل به‌صورت خودکار از طرف ترخینه ارسال شده است."
      lang="fa"
      dir="rtl"
    >
      <Text style={styles.eyebrow}>امنیت حساب کاربری</Text>

      <Heading as="h1" style={styles.heading}>
        بازیابی رمز عبور
      </Heading>

      <Text style={styles.paragraph}>سلام،</Text>

      <Text style={styles.paragraph}>
        درخواستی برای بازیابی رمز عبور حساب کاربری ترخینه شما دریافت کرده‌ایم.
        برای انتخاب رمز عبور جدید، روی دکمه زیر کلیک کنید.
      </Text>

      <Section style={styles.buttonSection}>
        <Button href={resetUrl} style={styles.button}>
          بازیابی رمز عبور
        </Button>
      </Section>

      <Text style={styles.smallText}>
        اگر شما درخواست بازیابی رمز عبور نداده‌اید، می‌توانید این ایمیل را
        نادیده بگیرید. رمز عبور شما بدون تکمیل فرایند بازیابی تغییر نخواهد کرد.
      </Text>

      <Hr style={styles.divider} />

      <Text style={styles.smallText}>
        اگر دکمه بالا کار نمی‌کند، لینک زیر را کپی کنید و در مرورگر خود قرار
        دهید:
      </Text>

      <Text style={styles.fallbackUrl}>{resetUrl}</Text>

      <Text style={styles.smallText}>
        برای حفظ امنیت حساب شما، این لینک پس از مدت مشخصی منقضی می‌شود. اگر لینک
        منقضی شده است، درخواست بازیابی رمز عبور جدیدی ثبت کنید.
      </Text>
    </EmailLayout>
  );
}
