import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The starting schema of chat-api: accounts, sign-in sessions, emailed codes,
 * two-factor recovery codes, the audit log and push tokens.
 */
export class Baseline1795000000000 implements MigrationInterface {
  name = 'Baseline1795000000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(
      `CREATE TABLE "users" (
        "id" SERIAL NOT NULL,
        "username" character varying(30) NOT NULL,
        "firstname" character varying(100) NOT NULL,
        "middlename" character varying(100),
        "lastname" character varying(100) NOT NULL,
        "email" character varying(150) NOT NULL,
        "password" character varying,
        "role" character varying(20) NOT NULL DEFAULT 'user',
        "phoneNumber" character varying(30),
        "dateOfBirth" date,
        "gender" character varying(20),
        "address" character varying(255),
        "jobTitle" character varying(100),
        "bio" text,
        "profileImage" character varying(500),
        "profileImageProvider" character varying(10),
        "provider" character varying(10) NOT NULL DEFAULT 'LOCAL',
        "googleId" character varying(100),
        "isVerified" boolean NOT NULL DEFAULT false,
        "isActive" boolean NOT NULL DEFAULT true,
        "twoFactorSecret" text,
        "twoFactorEnabled" boolean NOT NULL DEFAULT false,
        "twoFactorLastStep" integer,
        "mustChangePassword" boolean NOT NULL DEFAULT false,
        "deletedAt" TIMESTAMP WITH TIME ZONE,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_users" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_users_email" UNIQUE ("email"),
        CONSTRAINT "UQ_users_username" UNIQUE ("username"),
        CONSTRAINT "UQ_users_googleId" UNIQUE ("googleId")
      )`,
    );

    await q.query(
      `CREATE TABLE "sessions" ("id" uuid NOT NULL, "userId" integer NOT NULL, "tokenHash" character varying(64) NOT NULL, "deviceName" character varying(100), "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "lastUsedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_sessions" PRIMARY KEY ("id"), CONSTRAINT "FK_sessions_userId" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE)`,
    );
    await q.query(`CREATE INDEX "IDX_sessions_userId" ON "sessions" ("userId")`);

    await q.query(
      `CREATE TABLE "mail_tokens" ("id" SERIAL NOT NULL, "userId" integer NOT NULL, "purpose" character varying(10) NOT NULL, "tokenHash" character varying(64) NOT NULL, "expiryDate" TIMESTAMP NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_mail_tokens" PRIMARY KEY ("id"), CONSTRAINT "FK_mail_tokens_userId" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE)`,
    );
    await q.query(`CREATE INDEX "IDX_mail_tokens_userId" ON "mail_tokens" ("userId")`);

    await q.query(
      `CREATE TABLE "recovery_codes" ("id" SERIAL NOT NULL, "userId" integer NOT NULL, "codeHash" character varying(64) NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_recovery_codes" PRIMARY KEY ("id"), CONSTRAINT "FK_recovery_codes_userId" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE)`,
    );
    await q.query(`CREATE INDEX "IDX_recovery_codes_userId" ON "recovery_codes" ("userId")`);

    await q.query(
      `CREATE TABLE "audit_logs" ("id" SERIAL NOT NULL, "actorId" integer, "action" character varying(50) NOT NULL, "targetUserId" integer, "details" jsonb, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_audit_logs" PRIMARY KEY ("id"))`,
    );
    await q.query(`CREATE INDEX "IDX_audit_logs_createdAt" ON "audit_logs" ("createdAt")`);

    await q.query(
      `CREATE TABLE "devices" ("id" SERIAL NOT NULL, "userId" integer NOT NULL, "token" character varying(255) NOT NULL, "platform" character varying(10) NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "lastSeenAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_devices" PRIMARY KEY ("id"), CONSTRAINT "UQ_devices_token" UNIQUE ("token"), CONSTRAINT "FK_devices_userId" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE)`,
    );
    await q.query(`CREATE INDEX "IDX_devices_userId" ON "devices" ("userId")`);
  }

  public async down(q: QueryRunner): Promise<void> {
    for (const table of ['devices', 'audit_logs', 'recovery_codes', 'mail_tokens', 'sessions', 'users']) {
      await q.query(`DROP TABLE "${table}"`);
    }
  }
}
