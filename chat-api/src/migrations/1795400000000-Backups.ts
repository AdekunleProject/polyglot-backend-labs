import { MigrationInterface, QueryRunner } from 'typeorm';

/** Encrypted exports of a person's chats. The archive itself lives in S3. */
export class Backups1795400000000 implements MigrationInterface {
  name = 'Backups1795400000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(
      `CREATE TABLE "backups" (
        "id" uuid NOT NULL,
        "userId" integer NOT NULL,
        "status" character varying(10) NOT NULL DEFAULT 'pending',
        "key" character varying(300),
        "sizeBytes" bigint,
        "conversationCount" integer,
        "messageCount" integer,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "finishedAt" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_backups" PRIMARY KEY ("id")
      )`,
    );
    await q.query(`CREATE INDEX "IDX_backups_user" ON "backups" ("userId", "createdAt")`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE "backups"`);
  }
}
