import { MigrationInterface, QueryRunner } from 'typeorm';

/** Two-factor sign-in with an authenticator app, plus backup codes. */
export class AddTwoFactor1793800000000 implements MigrationInterface {
  name = 'AddTwoFactor1793800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ADD "twoFactorSecret" text`);
    await queryRunner.query(
      `ALTER TABLE "users" ADD "twoFactorEnabled" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(`ALTER TABLE "users" ADD "twoFactorLastStep" integer`);
    await queryRunner.query(
      `CREATE TABLE "recovery_codes" ("id" SERIAL NOT NULL, "userId" integer NOT NULL, "codeHash" character varying(64) NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_recovery_codes" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_recovery_codes_userId" ON "recovery_codes" ("userId")`,
    );
    await queryRunner.query(
      `ALTER TABLE "recovery_codes" ADD CONSTRAINT "FK_recovery_codes_userId" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "recovery_codes"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "twoFactorLastStep"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "twoFactorEnabled"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "twoFactorSecret"`);
  }
}
