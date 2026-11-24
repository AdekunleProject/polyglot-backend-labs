import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuditModule } from '../audit/audit.module';
import { ChatModule } from '../chat/chat.module';
import { ContactsModule } from '../contacts/contacts.module';
import { DevicesModule } from '../devices/devices.module';
import { FakeProvider, PAYMENT_PROVIDER, PaystackProvider } from './payment-provider';
import { AdminWalletController, PaymentWebhookController, WalletController } from './wallet.controller';
import { WalletService } from './wallet.service';

@Module({
  imports: [ChatModule, ContactsModule, DevicesModule, AuditModule],
  controllers: [WalletController, AdminWalletController, PaymentWebhookController],
  providers: [
    WalletService,
    {
      provide: PAYMENT_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        config.get('PAYMENTS_PROVIDER') === 'paystack'
          ? new PaystackProvider(config.getOrThrow<string>('PAYSTACK_SECRET_KEY'))
          : new FakeProvider(config.get('NODE_ENV') === 'production'),
    },
  ],
})
export class WalletModule {}
