import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Role hierarchy (superadmin, admin, manager, user): two account flags and an
 * audit log. The role column is plain text, so the new role names need no
 * change to it. Existing admins stay admins.
 */
export class RolesAndAudit1794000000000 implements MigrationInterface {
  name = 'RolesAndAudit1794000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD "mustChangePassword" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(`ALTER TABLE "users" ADD "deletedAt" TIMESTAMP WITH TIME ZONE`);
    await queryRunner.query(
      `CREATE TABLE "audit_logs" ("id" SERIAL NOT NULL, "actorId" integer, "action" character varying(50) NOT NULL, "targetUserId" integer, "details" jsonb, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_audit_logs" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_audit_logs_createdAt" ON "audit_logs" ("createdAt")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "audit_logs"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "deletedAt"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "mustChangePassword"`);
  }
}
