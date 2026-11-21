import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter?: nodemailer.Transporter;
  private readonly from?: string;
  private readonly production: boolean;

  constructor(config: ConfigService) {
    this.production = config.get('NODE_ENV') === 'production';
    this.from = config.get('MAIL_FROM') ?? config.get('MAIL_USER');

    const host = config.get<string>('MAIL_HOST');
    if (!host) {
      this.logger.warn('MAIL_HOST is not set: emails will not be sent');
      return;
    }
    const user = config.get<string>('MAIL_USER');
    this.transporter = nodemailer.createTransport({
      host,
      port: Number(config.get('MAIL_PORT') ?? 587),
      secure: config.get('MAIL_SECURE') === 'true',
      auth: user ? { user, pass: config.get<string>('MAIL_PASS') } : undefined,
    });
  }

  /**
   * Never throws: a mail outage must not break sign-up or password reset.
   * Returns whether the message was handed to the mail server, for the few
   * callers that must know (an admin-created account's password).
   */
  async sendEmail(to: string, subject: string, text: string): Promise<boolean> {
    if (!this.transporter) {
      // Local runs without a mail server: print the message so a developer
      // can read the code. Never in production, where it would leak codes.
      if (!this.production) {
        this.logger.log(`[mail disabled] to=${to} subject="${subject}" ${text}`);
      }
      return false;
    }
    try {
      await this.transporter.sendMail({ from: this.from, to, subject, text });
      this.logger.log(`Email sent to ${to}`);
      return true;
    } catch (error) {
      this.logger.error(`Could not send email to ${to}`, error as Error);
      return false;
    }
  }
}
