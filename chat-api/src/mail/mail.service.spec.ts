import { ConfigService } from '@nestjs/config';
import { MailService } from './mail.service';

describe('MailService', () => {
  it('sends nothing, does not throw and reports false when no mail server is configured', async () => {
    const service = new MailService(new ConfigService({}));
    await expect(
      service.sendEmail('a@b.co', 'Subject', 'Body'),
    ).resolves.toBe(false);
  });
});
