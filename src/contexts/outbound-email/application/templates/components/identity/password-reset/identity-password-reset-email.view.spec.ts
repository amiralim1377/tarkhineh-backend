import { createElement } from 'react';
import { describe, expect, it } from 'vitest';
import { render } from 'react-email';

import { IdentityPasswordResetEmailView } from './identity-password-reset-email.view.js';

describe('IdentityPasswordResetEmailView', () => {
  const resetUrl =
    'https://frontend.example/reset-password?token=opaque-token_123&email=user%40example.com';

  const logoUrl = 'https://assets.example.test/tarkhineh-logo-white.png';

  const email = () =>
    createElement(IdentityPasswordResetEmailView, {
      resetUrl,
      logoUrl,
    });

  it('renders Persian RTL HTML with the reset link and brand content', async () => {
    const html = await render(email());

    expect(html).toContain('بازیابی رمز عبور');
    expect(html).toContain('امنیت حساب کاربری');
    expect(html).toContain('ترخینه');
    expect(html).toContain(logoUrl);
    expect(html).toContain('<html dir="rtl" lang="fa">');

    expect(html).toContain(resetUrl.replaceAll('&', '&amp;'));

    expect(html).toContain('اگر شما درخواست بازیابی رمز عبور نداده‌اید');
  });

  it('renders a Persian plain-text version with the reset link', async () => {
    const text = await render(email(), {
      plainText: true,
    });

    expect(text).toContain('بازیابی رمز عبور');
    expect(text).toContain(resetUrl);

    expect(text).toContain('اگر شما درخواست بازیابی رمز عبور نداده‌اید');

    expect(text).toContain(
      'این ایمیل به‌صورت خودکار از طرف ترخینه ارسال شده است.',
    );
  });

  it('renders the fallback URL instructions in Persian', async () => {
    const html = await render(email());

    expect(html).toContain('اگر دکمه بالا کار نمی‌کند، لینک زیر را کپی کنید');

    expect(html).toContain('برای حفظ امنیت حساب شما');
  });

  it('renders the security expiration notice in Persian', async () => {
    const html = await render(email());

    expect(html).toContain('این لینک پس از مدت مشخصی');

    expect(html).toContain('درخواست بازیابی رمز عبور جدیدی ثبت کنید');
  });
});
