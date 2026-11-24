import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Sends a text message. SMS_PROVIDER picks the sender:
 *   termii   Nigerian provider (TERMII_API_KEY, TERMII_SENDER_ID)
 *   twilio   (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM)
 *   console  prints the text instead of sending it. Refused in production.
 * It returns false instead of throwing. Not tested against the real providers.
 */
@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);

  constructor(private readonly config: ConfigService) {}

  async send(to: string, text: string): Promise<boolean> {
    const provider = this.config.get<string>('SMS_PROVIDER') ?? 'console';
    try {
      if (provider === 'termii') return await this.termii(to, text);
      if (provider === 'twilio') return await this.twilio(to, text);
      if (this.config.get('NODE_ENV') === 'production') {
        this.logger.error('SMS_PROVIDER is not set: no text message was sent');
        return false;
      }
      this.logger.log(`[sms to ${to}] ${text}`);
      return true;
    } catch (error) {
      this.logger.error(`SMS failed: ${(error as Error).message}`);
      return false;
    }
  }

  private async termii(to: string, text: string): Promise<boolean> {
    const response = await fetch('https://api.ng.termii.com/api/sms/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: to.replace('+', ''),
        from: this.config.getOrThrow<string>('TERMII_SENDER_ID'),
        sms: text,
        type: 'plain',
        channel: 'generic',
        api_key: this.config.getOrThrow<string>('TERMII_API_KEY'),
      }),
    });
    return response.ok;
  }

  private async twilio(to: string, text: string): Promise<boolean> {
    const sid = this.config.getOrThrow<string>('TWILIO_ACCOUNT_SID');
    const token = this.config.getOrThrow<string>('TWILIO_AUTH_TOKEN');
    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
      },
      body: new URLSearchParams({
        To: to,
        From: this.config.getOrThrow<string>('TWILIO_FROM'),
        Body: text,
      }),
    });
    return response.ok;
  }
}
