import 'dotenv/config';
import { join } from 'path';
import { DataSource } from 'typeorm';
import { AuditLog } from './audit/entities/audit-log.entity';
import { MailToken } from './auth/entities/mail-token.entity';
import { RecoveryCode } from './auth/entities/recovery-code.entity';
import { Session } from './auth/entities/session.entity';
import { Device } from './devices/entities/device.entity';
import { User } from './users/entities/user.entity';

export default new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  username: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: process.env.DB_SSL === 'true',
  entities: [User, Session, MailToken, RecoveryCode, AuditLog, Device],
  migrations: [join(__dirname, 'migrations', '*{.ts,.js}')],
});
