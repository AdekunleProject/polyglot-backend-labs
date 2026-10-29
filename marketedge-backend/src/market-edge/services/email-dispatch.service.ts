import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailDispatchService {
  private transporter: nodemailer.Transporter;
  private readonly logger = new Logger(EmailDispatchService.name);

  constructor(private config: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: this.config.get<string>('SMTP_HOST', 'smtp.mailtrap.io'),
      port: this.config.get<number>('SMTP_PORT', 2525),
      auth: { user: this.config.get<string>('SMTP_USER'), pass: this.config.get<string>('SMTP_PASS') },
    });
  }

  async sendVerificationEmail(email: string, code: string) {
    try {
      await this.transporter.sendMail({
        from: '"MarketEdge Identity" <security@marketedge.com>',
        to: email,
        subject: 'Verify Your Identity Code',
        html: `<h3>Welcome to MarketEdge</h3><p>Your alphanumeric verification code is: <b>${code}</b></p>`
      });
    } catch (e) { this.logger.error('Mail dispatch error', e); }
  }

  async sendPasswordResetEmail(email: string, code: string) {
    try {
      await this.transporter.sendMail({
        from: '"MarketEdge Identity" <security@marketedge.com>',
        to: email,
        subject: 'Recovery Code Reset Loop Request',
        html: `<h3>Password Reset</h3><p>Your alphanumeric password reset code is: <b>${code}</b></p>`
      });
    } catch (e) { this.logger.error('Mail dispatch error', e); }
  }
}
