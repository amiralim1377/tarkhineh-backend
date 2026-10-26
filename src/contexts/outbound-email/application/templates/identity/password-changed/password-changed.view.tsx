import { Heading, Text } from 'react-email';
import type { CSSProperties } from 'react';

import { EmailLayout } from '../../shared/layout/email-layout.js';

export interface PasswordChangedEmailViewProps {
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
    fontSize: '24px',
    fontWeight: '700',
    lineHeight: '1.7',
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

  securityNotice: {
    backgroundColor: '#F9F9F9',
    borderRight: '4px solid #417F56',
    borderRadius: '4px',
    color: '#535353',
    fontFamily: '"Estedad", Tahoma, Arial, sans-serif',
    fontSize: '14px',
    lineHeight: '2',
    padding: '12px 16px',
    textAlign: 'right',
  },
};

export function PasswordChangedEmailView({
  logoUrl,
}: PasswordChangedEmailViewProps) {
  return (
    <EmailLayout
      previewText="رمز عبور حساب کاربری شما تغییر کرده است."
      logoUrl={logoUrl}
      footerMessage="این ایمیل به‌صورت خودکار از طرف ترخینه ارسال شده است."
      lang="fa"
      dir="rtl"
    >
      <Text style={styles.eyebrow}>اعلان امنیتی حساب کاربری</Text>

      <Heading as="h1" style={styles.heading}>
        رمز عبور شما تغییر کرد
      </Heading>

      <Text style={styles.paragraph}>سلام،</Text>

      <Text style={styles.paragraph}>
        رمز عبور حساب کاربری ترخینه شما با موفقیت تغییر کرده است. اگر خودتان این
        تغییر را انجام داده‌اید، نیازی به اقدام دیگری نیست.
      </Text>

      <Text style={styles.securityNotice}>
        اگر این تغییر را شما انجام نداده‌اید، حساب کاربری شما ممکن است در معرض
        خطر باشد. در این صورت، هرچه سریع‌تر از مسیر رسمی پشتیبانی ترخینه برای
        محافظت از حساب خود کمک بگیرید.
      </Text>
    </EmailLayout>
  );
}
