// import { Injectable } from '@nestjs/common';
// import * as nodemailer from 'nodemailer';

// @Injectable()
// export class MailService {
//   async sendEmail(email: string, subject: string, html: string) {
//     try {
//       const transporter = nodemailer.createTransport({
//         service: 'gmail',
//         auth: {
//           user: process.env.USER,
//           pass: process.env.PASS,
//         },
//       });

//       await transporter.sendMail({
//         from: process.env.USER,
//         to: email,
//         subject,
//         html,
//       });

//       console.log('Email sent');
//     } catch (error) {
//       console.log('Email not sent', error);
//     }
//   }
// }