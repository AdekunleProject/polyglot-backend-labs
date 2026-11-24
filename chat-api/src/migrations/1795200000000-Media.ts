import { MigrationInterface, QueryRunner } from 'typeorm';

/** Files that are uploaded straight to S3 and then attached to a message. */
export class Media1795200000000 implements MigrationInterface {
  name = 'Media1795200000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(
      `CREATE TABLE "media_uploads" (
        "id" uuid NOT NULL,
        "ownerId" integer NOT NULL,
        "conversationId" uuid NOT NULL,
        "kind" character varying(10) NOT NULL,
        "key" character varying(300) NOT NULL,
        "contentType" character varying(100) NOT NULL,
        "size" bigint NOT NULL,
        "name" character varying(200),
        "durationMs" integer,
        "waveform" jsonb,
        "width" integer,
        "height" integer,
        "messageId" integer,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_media_uploads" PRIMARY KEY ("id")
      )`,
    );
    await q.query(`CREATE INDEX "IDX_media_uploads_owner" ON "media_uploads" ("ownerId")`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE "media_uploads"`);
  }
}
