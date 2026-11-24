import { MigrationInterface, QueryRunner } from 'typeorm';

/** Voice and video calls. The audio and video themselves go through the media server, not through here. */
export class Calls1795800000000 implements MigrationInterface {
  name = 'Calls1795800000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(
      `CREATE TABLE "calls" (
        "id" uuid NOT NULL,
        "seq" SERIAL NOT NULL,
        "conversationId" uuid NOT NULL,
        "initiatorId" integer NOT NULL,
        "type" character varying(5) NOT NULL,
        "status" character varying(10) NOT NULL DEFAULT 'ringing',
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "answeredAt" TIMESTAMP WITH TIME ZONE,
        "endedAt" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_calls" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_calls_seq" UNIQUE ("seq"),
        CONSTRAINT "CHK_calls_type" CHECK ("type" IN ('audio', 'video')),
        CONSTRAINT "CHK_calls_status" CHECK ("status" IN ('ringing', 'active', 'ended', 'missed', 'declined', 'cancelled'))
      )`,
    );
    await q.query(`CREATE INDEX "IDX_calls_conversation" ON "calls" ("conversationId", "seq")`);
    await q.query(
      `CREATE TABLE "call_participants" (
        "callId" uuid NOT NULL,
        "userId" integer NOT NULL,
        "status" character varying(10) NOT NULL,
        "joinedAt" TIMESTAMP WITH TIME ZONE,
        "leftAt" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_call_participants" PRIMARY KEY ("callId", "userId"),
        CONSTRAINT "CHK_call_participants_status" CHECK ("status" IN ('invited', 'joined', 'declined', 'left', 'missed'))
      )`,
    );
    await q.query(`CREATE INDEX "IDX_call_participants_user" ON "call_participants" ("userId", "status")`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE "call_participants"`);
    await q.query(`DROP TABLE "calls"`);
  }
}
