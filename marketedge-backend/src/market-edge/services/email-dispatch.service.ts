import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailDispatchService {
  private transporter: nodemailer.Transporter;
  private readonly from: string;
  private readonly logger = new Logger(EmailDispatchService.name);

  constructor(private config: ConfigService) {
    // Environment values are strings; nodemailer needs a number.
    const port = Number(this.config.get<string>('SMTP_PORT', '2525'));
    this.from = this.config.get<string>('SMTP_FROM', '"MarketEdge" <no-reply@marketedge.local>');
    this.transporter = nodemailer.createTransport({
      host: this.config.get<string>('SMTP_HOST', 'smtp.mailtrap.io'),
      port,
      secure: port === 465,
      auth: { user: this.config.get<string>('SMTP_USER'), pass: this.config.get<string>('SMTP_PASS') },
    });
  }

  async sendVerificationEmail(email: string, code: string) {
    await this.send(email, 'Verify your MarketEdge account', `<h3>Welcome to MarketEdge</h3><p>Your verification code is: <b>${code}</b></p><p>It expires in 15 minutes.</p>`);
  }

  async sendPasswordResetEmail(email: string, code: string) {
    await this.send(email, 'Reset your MarketEdge password', `<h3>Password reset</h3><p>Your reset code is: <b>${code}</b></p><p>It expires in 15 minutes. If you did not ask for this, ignore this email.</p>`);
  }

  // A mail failure is logged and does not fail the request. Users can ask for
  // a new code with the resendVerification mutation.
  private async send(to: string, subject: string, html: string) {
    try {
      await this.transporter.sendMail({ from: this.from, to, subject, html });
    } catch (error) {
      this.logger.error(`Could not send "${subject}" email`, error as Error);
    }
  }
}
