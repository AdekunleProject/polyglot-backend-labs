import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddIsPinnedToNotes1792443649838 implements MigrationInterface {
  name = 'AddIsPinnedToNotes1792443649838';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "notes" ADD "isPinned" boolean NOT NULL DEFAULT false`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "notes" DROP COLUMN "isPinned"`);
  }
}
