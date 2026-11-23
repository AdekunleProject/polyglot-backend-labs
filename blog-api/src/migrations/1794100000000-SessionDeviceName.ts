import { MigrationInterface, QueryRunner } from 'typeorm';

/** A label for each signed-in device, so a phone app can list and revoke them. */
export class SessionDeviceName1794100000000 implements MigrationInterface {
  name = 'SessionDeviceName1794100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "sessions" ADD "deviceName" character varying(100)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "sessions" DROP COLUMN "deviceName"`);
  }
}
