import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Replaces the single "name" with firstname, middlename and lastname. Existing
 * names are split at the first space: "Ada Writer" becomes Ada / Writer, and a
 * one-word name gets an empty lastname.
 */
export class SplitUserName1793900000000 implements MigrationInterface {
  name = 'SplitUserName1793900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ADD "firstname" character varying(100)`);
    await queryRunner.query(`ALTER TABLE "users" ADD "middlename" character varying(100)`);
    await queryRunner.query(`ALTER TABLE "users" ADD "lastname" character varying(100)`);
    await queryRunner.query(
      `UPDATE "users" SET "firstname" = split_part(trim("name"), ' ', 1), "lastname" = trim(substring(trim("name") from position(' ' in trim("name")) + 1)) WHERE position(' ' in trim("name")) > 0`,
    );
    await queryRunner.query(
      `UPDATE "users" SET "firstname" = trim("name"), "lastname" = '' WHERE "firstname" IS NULL`,
    );
    await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "firstname" SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "lastname" SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "name"`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ADD "name" character varying(100)`);
    await queryRunner.query(
      `UPDATE "users" SET "name" = trim(concat_ws(' ', "firstname", "middlename", "lastname"))`,
    );
    await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "name" SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "lastname"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "middlename"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "firstname"`);
  }
}
