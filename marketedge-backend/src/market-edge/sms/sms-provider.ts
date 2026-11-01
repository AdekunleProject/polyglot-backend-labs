import { Injectable, Logger } from '@nestjs/common';

export const SMS_PROVIDER = 'SMS_PROVIDER';

export interface SmsProvider {
  send(phone: string, message: string): Promise<{ providerMessageId?: string }>;
}

export function maskPhone(phone: string): string {
  return phone.length <= 4 ? '****' : `${'*'.repeat(phone.length - 4)}${phone.slice(-4)}`;
}

/**
 * Default provider: sends nothing and only logs (dry run), so the queue and
 * worker can be exercised without an SMS account. Swap it for a real provider
 * (Termii, Twilio, ...) by implementing SmsProvider and changing the binding
 * in MarketEdgeModule.
 */
@Injectable()
export class LogSmsProvider implements SmsProvider {
  private readonly logger = new Logger('SmsProvider');

  async send(phone: string, message: string): Promise<{ providerMessageId?: string }> {
    this.logger.log(`[dry run] SMS to ${maskPhone(phone)} (${message.length} characters)`);
    return { providerMessageId: `dry-run-${Date.now()}` };
  }
}
