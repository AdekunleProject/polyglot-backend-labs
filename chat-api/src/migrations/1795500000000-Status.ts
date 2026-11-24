import { MigrationInterface, QueryRunner } from 'typeorm';

/** Status posts: photos, videos and text that disappear after a day. */
export class Status1795500000000 implements MigrationInterface {
  name = 'Status1795500000000';

  public async up(q: QueryRunner): Promise<void> {
    // A status file is not tied to a chat.
    await q.query(`ALTER TABLE "media_uploads" ALTER COLUMN "conversationId" DROP NOT NULL`);

    await q.query(
      `CREATE TABLE "statuses" (
        "id" SERIAL NOT NULL,
        "userId" integer NOT NULL,
        "type" character varying(10) NOT NULL,
        "body" character varying(700),
        "bgColor" character varying(9),
        "media" jsonb,
        "privacy" character varying(10) NOT NULL DEFAULT 'contacts',
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL,
        "deletedAt" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_statuses" PRIMARY KEY ("id")
      )`,
    );
    await q.query(`CREATE INDEX "IDX_statuses_user" ON "statuses" ("userId", "id")`);
    await q.query(`CREATE INDEX "IDX_statuses_expires" ON "statuses" ("expiresAt")`);
    await q.query(
      `CREATE TABLE "status_audience" (
        "statusId" integer NOT NULL,
        "userId" integer NOT NULL,
        CONSTRAINT "PK_status_audience" PRIMARY KEY ("statusId", "userId")
      )`,
    );
    await q.query(
      `CREATE TABLE "status_views" (
        "statusId" integer NOT NULL,
        "viewerId" integer NOT NULL,
        "viewedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_status_views" PRIMARY KEY ("statusId", "viewerId")
      )`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE "status_views"`);
    await q.query(`DROP TABLE "status_audience"`);
    await q.query(`DROP TABLE "statuses"`);
  }
}
