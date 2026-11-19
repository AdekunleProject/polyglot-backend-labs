import { ConfigService } from '@nestjs/config';
import { MailService } from './mail.service';

describe('MailService', () => {
  it('does nothing and does not throw when no mail server is configured', async () => {
    const service = new MailService(new ConfigService({}));
    await expect(
      service.sendEmail('a@b.co', 'Subject', 'Body'),
    ).resolves.toBeUndefined();
  });
});
