import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Brings the e-commerce style authentication to the blog: richer profiles,
 * email verification, Google sign-in, per-device sessions and emailed codes.
 */
export class AddAuthFeatures1793700000000 implements MigrationInterface {
  name = 'AddAuthFeatures1793700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "password" DROP NOT NULL`);
    await queryRunner.query(`ALTER TABLE "users" ADD "phoneNumber" character varying(30)`);
    await queryRunner.query(`ALTER TABLE "users" ADD "dateOfBirth" date`);
    await queryRunner.query(`ALTER TABLE "users" ADD "gender" character varying(20)`);
    await queryRunner.query(`ALTER TABLE "users" ADD "address" character varying(255)`);
    await queryRunner.query(`ALTER TABLE "users" ADD "jobTitle" character varying(100)`);
    await queryRunner.query(`ALTER TABLE "users" ADD "bio" text`);
    await queryRunner.query(`ALTER TABLE "users" ADD "profileImage" character varying(500)`);
    await queryRunner.query(`ALTER TABLE "users" ADD "profileImageProvider" character varying(10)`);
    await queryRunner.query(`ALTER TABLE "users" ADD "provider" character varying(10) NOT NULL DEFAULT 'LOCAL'`);
    await queryRunner.query(`ALTER TABLE "users" ADD "googleId" character varying(100)`);
    await queryRunner.query(`ALTER TABLE "users" ADD CONSTRAINT "UQ_users_googleId" UNIQUE ("googleId")`);
    await queryRunner.query(`ALTER TABLE "users" ADD "isVerified" boolean NOT NULL DEFAULT false`);
    await queryRunner.query(`ALTER TABLE "users" ADD "isActive" boolean NOT NULL DEFAULT true`);
    await queryRunner.query(`ALTER TABLE "users" ADD "createdAt" TIMESTAMP NOT NULL DEFAULT now()`);
    // Accounts that existed before verification was introduced stay usable.
    await queryRunner.query(`UPDATE "users" SET "isVerified" = true`);

    await queryRunner.query(
      `CREATE TABLE "sessions" ("id" uuid NOT NULL, "userId" integer NOT NULL, "tokenHash" character varying(64) NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "lastUsedAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_sessions" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_sessions_userId" ON "sessions" ("userId")`);
    await queryRunner.query(
      `ALTER TABLE "sessions" ADD CONSTRAINT "FK_sessions_userId" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );

    await queryRunner.query(
      `CREATE TABLE "mail_tokens" ("id" SERIAL NOT NULL, "userId" integer NOT NULL, "purpose" character varying(10) NOT NULL, "tokenHash" character varying(64) NOT NULL, "expiryDate" TIMESTAMP NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_mail_tokens" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(`CREATE INDEX "IDX_mail_tokens_userId" ON "mail_tokens" ("userId")`);
    await queryRunner.query(
      `ALTER TABLE "mail_tokens" ADD CONSTRAINT "FK_mail_tokens_userId" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "mail_tokens" DROP CONSTRAINT "FK_mail_tokens_userId"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_mail_tokens_userId"`);
    await queryRunner.query(`DROP TABLE "mail_tokens"`);
    await queryRunner.query(`ALTER TABLE "sessions" DROP CONSTRAINT "FK_sessions_userId"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_sessions_userId"`);
    await queryRunner.query(`DROP TABLE "sessions"`);
    for (const column of [
      'createdAt', 'isActive', 'isVerified', 'googleId', 'provider',
      'profileImageProvider', 'profileImage', 'bio', 'jobTitle', 'address',
      'gender', 'dateOfBirth', 'phoneNumber',
    ]) {
      if (column === 'googleId') {
        await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT "UQ_users_googleId"`);
      }
      await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "${column}"`);
    }
    // Google-only accounts have no password, so they cannot go back.
    await queryRunner.query(`DELETE FROM "users" WHERE "password" IS NULL`);
    await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "password" SET NOT NULL`);
  }
}
