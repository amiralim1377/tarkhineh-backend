import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport } from 'nodemailer';

import type { EmailVerificationSender } from '../../application/ports/email-verification-sender.port.js';

@Injectable()
export class SmtpEmailVerificationSender implements EmailVerificationSender {
  constructor(private readonly configService: ConfigService) {}

  async sendVerificationEmail(email: string, rawToken: string): Promise<void> {
    const host = this.configService.get<string>('SMTP_HOST');
    const port = this.configService.get<number>('SMTP_PORT') ?? 587;
    const username = this.configService.get<string>('SMTP_USER');
    const password = this.configService.get<string>('SMTP_PASSWORD');
    const from = this.configService.get<string>('SMTP_FROM');
    const apiPublicUrl = this.configService.get<string>('API_PUBLIC_URL');

    if (
      !host ||
      !Number.isInteger(port) ||
      port <= 0 ||
      port > 65535 ||
      !username ||
      !password ||
      !from ||
      !apiPublicUrl
    ) {
      throw new Error('SMTP or API public URL configuration is incomplete.');
    }

    const verificationUrl = new URL('/auth/verify-email', apiPublicUrl);
    verificationUrl.searchParams.set('token', rawToken);

    const transporter = createTransport({
      host,
      port,
      secure:
        this.configService.get<string>('SMTP_SECURE') === 'true' ||
        (this.configService.get<string>('SMTP_SECURE') === undefined &&
          port === 465),
      auth: {
        user: username,
        pass: password,
      },
    });

    await transporter.sendMail({
      from,
      to: email,
      subject: 'Verify your Tarkhineh email',
      text: [
        'Welcome to Tarkhineh.',
        '',
        'Verify your email using the link below:',
        verificationUrl.toString(),
        '',
        'This link expires after 30 minutes.',
        'If you did not request this registration, you can ignore this email.',
      ].join('\n'),
      html: `
        <h2>Welcome to Tarkhineh</h2>
        <p>Verify your email address to complete your registration.</p>
        <p>
          <a href="${verificationUrl.toString()}">
            Verify email address
          </a>
        </p>
        <p>This link expires after 30 minutes.</p>
        <p>If you did not request this registration, you can ignore this email.</p>
      `,
    });
  }
}
