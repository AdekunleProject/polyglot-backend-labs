import { MigrationInterface, QueryRunner } from 'typeorm';

/** Verified phone numbers, SMS codes, QR device links and QR contact codes. */
export class LinkingAndPhone1795300000000 implements MigrationInterface {
  name = 'LinkingAndPhone1795300000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "users" ADD "phoneVerifiedAt" TIMESTAMP WITH TIME ZONE`);
    await q.query(`ALTER TABLE "users" ADD "qrVersion" integer NOT NULL DEFAULT 0`);
    await q.query(`ALTER TABLE "users" ADD "qrEnabled" boolean NOT NULL DEFAULT true`);
    // One verified owner per number. Unverified numbers typed at sign-up may repeat.
    await q.query(
      `CREATE UNIQUE INDEX "UQ_users_verified_phone" ON "users" ("phoneNumber") WHERE "phoneVerifiedAt" IS NOT NULL`,
    );

    await q.query(
      `CREATE TABLE "phone_codes" (
        "id" SERIAL NOT NULL,
        "purpose" character varying(10) NOT NULL,
        "phone" character varying(20) NOT NULL,
        "userId" integer,
        "codeHash" character varying(64) NOT NULL,
        "attempts" integer NOT NULL DEFAULT 0,
        "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_phone_codes" PRIMARY KEY ("id")
      )`,
    );
    await q.query(`CREATE INDEX "IDX_phone_codes_phone" ON "phone_codes" ("phone", "purpose", "id")`);

    await q.query(
      `CREATE TABLE "device_links" (
        "id" uuid NOT NULL,
        "secretHash" character varying(64) NOT NULL,
        "deviceName" character varying(100) NOT NULL,
        "status" character varying(10) NOT NULL DEFAULT 'pending',
        "userId" integer,
        "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_device_links" PRIMARY KEY ("id")
      )`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE "device_links"`);
    await q.query(`DROP TABLE "phone_codes"`);
    await q.query(`DROP INDEX "UQ_users_verified_phone"`);
    await q.query(`ALTER TABLE "users" DROP COLUMN "qrEnabled"`);
    await q.query(`ALTER TABLE "users" DROP COLUMN "qrVersion"`);
    await q.query(`ALTER TABLE "users" DROP COLUMN "phoneVerifiedAt"`);
  }
}
