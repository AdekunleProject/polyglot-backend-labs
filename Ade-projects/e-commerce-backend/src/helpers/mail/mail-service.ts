import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter?: nodemailer.Transporter;

  constructor() {
    const host = process.env.MAIL_HOST;
    if (!host) {
      this.logger.warn('MAIL_HOST is not set: emails will not be sent');
      return;
    }
    this.transporter = nodemailer.createTransport({
      host,
      port: Number(process.env.MAIL_PORT ?? 587),
      secure: process.env.MAIL_SECURE === 'true',
      auth: process.env.MAIL_USER
        ? { user: process.env.MAIL_USER, pass: process.env.MAIL_PASS }
        : undefined,
    });
  }

  /**
   * Never throws: a mail outage must not break sign-up or password reset.
   * Returns whether the message was handed to the mail server, for the few
   * callers that must know (an admin-created account's password).
   */
  sendEmail = async (
    email: string,
    subject: string,
    text: string,
  ): Promise<boolean> => {
    if (!this.transporter) {
      // Local runs without a mail server: print the message so a developer
      // can read the code. Never in production, where it would leak codes.
      if (process.env.NODE_ENV !== 'production') {
        this.logger.log(`[mail disabled] to=${email} subject="${subject}" ${text}`);
      }
      return false;
    }
    try {
      await this.transporter.sendMail({
        from: process.env.MAIL_FROM ?? process.env.MAIL_USER,
        to: email,
        subject,
        text,
      });
      this.logger.log(`Email sent to ${email}`);
      return true;
    } catch (error) {
      this.logger.error(`Could not send email to ${email}`, error as Error);
      return false;
    }
  };
}
