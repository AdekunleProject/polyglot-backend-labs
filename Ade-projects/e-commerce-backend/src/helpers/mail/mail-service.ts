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

  sendEmail = async (email: string, subject: string, text: string) => {
    if (!this.transporter) {
      return;
    }
    try {
      await this.transporter.sendMail({
        from: process.env.MAIL_FROM ?? process.env.MAIL_USER,
        to: email,
        subject,
        text,
      });
      this.logger.log(`Email sent to ${email}`);
    } catch (error) {
      this.logger.error(`Could not send email to ${email}`, error as Error);
    }
  };
}