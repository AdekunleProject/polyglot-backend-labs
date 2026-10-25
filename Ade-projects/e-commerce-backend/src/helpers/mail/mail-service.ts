import * as nodemailer from 'nodemailer';
export class MailService {
  sendEmail = async (email: string, subject: string, text: string) => {
    try {
      const transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          type: 'Bearer',
          user: process.env.MAIL_USER,
          pass: process.env.MAIL_PASS,
          clientId: process.env.CLIENT_ID,
          clientSecret: process.env.CLIENT_SECRET,
          refreshToken: process.env.REFRESH_TOKEN,
        },
      } as any);
      await transporter.sendMail({
        from: process.env.USER,
        to: email,
        subject: subject,
        text: text,
      });
      console.log('verification link has been sent to your email ');
    } catch (error) {
      console.log(
        error,
        'could not send verificaton link to your email account',
      );
    }
  };
}
