import { Button, Heading, Hr, Section, Text } from 'react-email';

import type { CSSProperties } from 'react';

import { EmailLayout } from '../../shared/layout/email-layout.js';

export interface MembershipInvitationEmailViewProps {
  readonly invitationUrl: string;
  readonly organizationName: string;
  readonly branchName: string | null;
  readonly scope: 'ORGANIZATION' | 'BRANCH';
  readonly expiresAtLabel: string;
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

  organizationName: {
    color: '#396F4B',
    fontWeight: '700',
  },

  branchName: {
    color: '#396F4B',
    fontWeight: '700',
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

export function MembershipInvitationEmailView({
  invitationUrl,
  organizationName,
  branchName,
  scope,
  expiresAtLabel,
  logoUrl,
}: MembershipInvitationEmailViewProps) {
  const isBranchInvitation = scope === 'BRANCH';

  return (
    <EmailLayout
      previewText="برای پیوستن به مجموعه ترخینه، دعوت‌نامه خود را بررسی کنید."
      logoUrl={logoUrl}
      footerMessage="این ایمیل به‌صورت خودکار از طرف ترخینه ارسال شده است."
      lang="fa"
      dir="rtl"
    >
      <Text style={styles.eyebrow}>دعوت‌نامه عضویت</Text>

      <Heading as="h1" style={styles.heading}>
        شما به ترخینه دعوت شده‌اید
      </Heading>

      <Text style={styles.paragraph}>سلام،</Text>

      <Text style={styles.paragraph}>
        شما برای پیوستن به {isBranchInvitation ? 'شعبه‌ای از سازمان' : 'سازمان'}{' '}
        <span style={styles.organizationName}>{organizationName}</span> دعوت
        شده‌اید.
      </Text>

      {isBranchInvitation && branchName && (
        <Text style={styles.paragraph}>
          نام شعبه: <span style={styles.branchName}>{branchName}</span>
        </Text>
      )}

      <Text style={styles.paragraph}>
        برای مشاهده جزئیات و پذیرش دعوت‌نامه، روی دکمه زیر کلیک کنید.
      </Text>

      <Section style={styles.buttonSection}>
        <Button href={invitationUrl} style={styles.button}>
          مشاهده و پذیرش دعوت‌نامه
        </Button>
      </Section>

      <Text style={styles.smallText}>
        این دعوت‌نامه تا تاریخ {expiresAtLabel} معتبر است.
      </Text>

      <Text style={styles.smallText}>
        اگر شما انتظار دریافت این دعوت‌نامه را نداشته‌اید، می‌توانید این ایمیل
        را نادیده بگیرید.
      </Text>

      <Hr style={styles.divider} />

      <Text style={styles.smallText}>
        اگر دکمه بالا کار نمی‌کند، لینک زیر را کپی کنید و در مرورگر خود قرار
        دهید:
      </Text>

      <Text style={styles.fallbackUrl}>{invitationUrl}</Text>

      <Text style={styles.smallText}>
        برای حفظ امنیت حساب شما، این لینک اختصاصی است و نباید آن را با دیگران به
        اشتراک بگذارید.
      </Text>
    </EmailLayout>
  );
}
