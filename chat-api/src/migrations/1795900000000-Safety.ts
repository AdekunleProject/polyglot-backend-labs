import { MigrationInterface, QueryRunner } from 'typeorm';

/** Blocking people, and reports about a person, a message or a status. */
export class Safety1795900000000 implements MigrationInterface {
  name = 'Safety1795900000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(
      `CREATE TABLE "blocks" (
        "blockerId" integer NOT NULL,
        "blockedId" integer NOT NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_blocks" PRIMARY KEY ("blockerId", "blockedId"),
        CONSTRAINT "CHK_blocks_self" CHECK ("blockerId" <> "blockedId")
      )`,
    );
    await q.query(`CREATE INDEX "IDX_blocks_blocked" ON "blocks" ("blockedId")`);

    await q.query(
      `CREATE TABLE "reports" (
        "id" SERIAL NOT NULL,
        "reporterId" integer NOT NULL,
        "targetType" character varying(10) NOT NULL,
        "targetId" integer NOT NULL,
        "accusedId" integer NOT NULL,
        "conversationId" uuid,
        "category" character varying(12) NOT NULL,
        "reason" character varying(1000) NOT NULL,
        "evidence" jsonb,
        "status" character varying(10) NOT NULL DEFAULT 'open',
        "reviewValid" boolean,
        "reviewNote" character varying(500),
        "reviewedById" integer,
        "reviewedAt" TIMESTAMP WITH TIME ZONE,
        "decision" character varying(20),
        "decisionReason" character varying(500),
        "decidedById" integer,
        "decidedAt" TIMESTAMP WITH TIME ZONE,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_reports" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_reports_type" CHECK ("targetType" IN ('user', 'message', 'status')),
        CONSTRAINT "CHK_reports_status" CHECK ("status" IN ('open', 'reviewed', 'dismissed', 'actioned'))
      )`,
    );
    // One live report per person per thing.
    await q.query(
      `CREATE UNIQUE INDEX "UQ_reports_live" ON "reports" ("reporterId", "targetType", "targetId") WHERE "status" IN ('open', 'reviewed')`,
    );
    await q.query(`CREATE INDEX "IDX_reports_status" ON "reports" ("status", "id")`);
    await q.query(`CREATE INDEX "IDX_reports_target" ON "reports" ("targetType", "targetId")`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE "reports"`);
    await q.query(`DROP TABLE "blocks"`);
  }
}
