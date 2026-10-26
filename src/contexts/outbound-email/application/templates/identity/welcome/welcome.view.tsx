import { Heading, Text } from 'react-email';
import type { CSSProperties } from 'react';

import { EmailLayout } from '../../shared/layout/email-layout.js';

export interface WelcomeEmailViewProps {
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
  notice: {
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

export function WelcomeEmailView({ logoUrl }: WelcomeEmailViewProps) {
  return (
    <EmailLayout
      previewText="به ترخینه خوش آمدید؛ ایمیل شما تأیید شد."
      logoUrl={logoUrl}
      footerMessage="این ایمیل به‌صورت خودکار از طرف ترخینه ارسال شده است."
      lang="fa"
      dir="rtl"
    >
      <Text style={styles.eyebrow}>به خانواده ترخینه خوش آمدید</Text>

      <Heading as="h1" style={styles.heading}>
        حساب کاربری شما فعال شد
      </Heading>

      <Text style={styles.paragraph}>سلام،</Text>

      <Text style={styles.paragraph}>
        به ترخینه خوش آمدید! آدرس ایمیل شما با موفقیت تأیید شده و حساب کاربری
        شما فعال است.
      </Text>

      <Text style={styles.paragraph}>
        از اینکه ترخینه را انتخاب کرده‌اید خوشحالیم. امیدواریم تجربه‌ای خوب و
        دلپذیر داشته باشید.
      </Text>

      <Text style={styles.notice}>
        برای حفظ امنیت حساب خود، رمز عبورتان را با دیگران به اشتراک نگذارید. اگر
        این حساب را ایجاد نکرده‌اید، با پشتیبانی ترخینه تماس بگیرید.
      </Text>
    </EmailLayout>
  );
}
