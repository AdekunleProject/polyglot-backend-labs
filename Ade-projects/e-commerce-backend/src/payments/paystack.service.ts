import { BadGatewayException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { InitializeTransactionInterface } from '../common/interfaces/initialize-transaction.interface';

@Injectable()
export class PayStackService {
  private readonly baseUrl = 'https://api.paystack.co';
  private readonly secretKey: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.secretKey = this.configService.getOrThrow<string>(
      'PAYSTACK_SECRET_KEY',
    );
  }

  private get headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.secretKey}`,
      'Content-Type': 'application/json',
    };
  }

  async initializeTransaction(data: InitializeTransactionInterface) {
    try {
      const response = await firstValueFrom(
        this.httpService.post(`${this.baseUrl}/transaction/initialize`, data, {
          headers: this.headers,
          timeout: 10000,
        }),
      );

      return response.data;
    } catch (error) {
      throw new BadGatewayException('Unable to initialize payment.');
    }
  }

  async verifyTransaction(reference: string) {
    try {
      const response = await firstValueFrom(
        this.httpService.get(
          `${this.baseUrl}/transaction/verify/${reference}`,
          {
            headers: this.headers,
            timeout: 10000,
          },
        ),
      );

      return response.data;
    } catch (error) {
      throw new BadGatewayException('Unable to verify payment.');
    }
  }

  async refundTransaction(transaction: string, amount?: number) {
    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.baseUrl}/refund`,
          {
            transaction,
            amount,
          },
          {
            headers: this.headers,
            timeout: 10000,
          },
        ),
      );

      return response.data;
    } catch (error) {
      throw new BadGatewayException('Unable to refund payment.');
    }
  }
}
