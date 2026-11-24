import { MigrationInterface, QueryRunner } from 'typeorm';

/** Conversations (direct and group), their members and the messages in them. */
export class ChatCore1795100000000 implements MigrationInterface {
  name = 'ChatCore1795100000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "users" ADD "lastSeenAt" TIMESTAMP WITH TIME ZONE`);

    await q.query(
      `CREATE TABLE "conversations" (
        "id" uuid NOT NULL,
        "type" character varying(10) NOT NULL,
        "title" character varying(100),
        "directKey" character varying(32),
        "createdById" integer,
        "lastMessageId" integer,
        "lastMessageAt" TIMESTAMP WITH TIME ZONE,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_conversations" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_conversations_directKey" UNIQUE ("directKey"),
        CONSTRAINT "CHK_conversations_type" CHECK ("type" IN ('direct', 'group')),
        CONSTRAINT "FK_conversations_createdById" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL
      )`,
    );

    await q.query(
      `CREATE TABLE "conversation_members" (
        "conversationId" uuid NOT NULL,
        "userId" integer NOT NULL,
        "role" character varying(10) NOT NULL DEFAULT 'member',
        "joinedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "leftAt" TIMESTAMP WITH TIME ZONE,
        "lastDeliveredMessageId" integer NOT NULL DEFAULT 0,
        "lastReadMessageId" integer NOT NULL DEFAULT 0,
        "mutedUntil" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_conversation_members" PRIMARY KEY ("conversationId", "userId"),
        CONSTRAINT "CHK_members_role" CHECK ("role" IN ('owner', 'admin', 'member')),
        CONSTRAINT "FK_members_conversationId" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_members_userId" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE
      )`,
    );
    await q.query(`CREATE INDEX "IDX_members_userId" ON "conversation_members" ("userId")`);

    await q.query(
      `CREATE TABLE "messages" (
        "id" SERIAL NOT NULL,
        "conversationId" uuid NOT NULL,
        "senderId" integer,
        "type" character varying(10) NOT NULL DEFAULT 'text',
        "body" text,
        "replyToId" integer,
        "media" jsonb,
        "clientId" character varying(64),
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "editedAt" TIMESTAMP WITH TIME ZONE,
        "deletedAt" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_messages" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_messages_type" CHECK ("type" IN ('text', 'image', 'file', 'voice', 'video', 'system')),
        CONSTRAINT "FK_messages_conversationId" FOREIGN KEY ("conversationId") REFERENCES "conversations"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_messages_senderId" FOREIGN KEY ("senderId") REFERENCES "users"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_messages_replyToId" FOREIGN KEY ("replyToId") REFERENCES "messages"("id") ON DELETE SET NULL
      )`,
    );
    await q.query(`CREATE INDEX "IDX_messages_conversation_id" ON "messages" ("conversationId", "id")`);
    // A phone that retries a send (bad network) must not create the message twice.
    await q.query(
      `CREATE UNIQUE INDEX "UQ_messages_sender_clientId" ON "messages" ("senderId", "clientId") WHERE "clientId" IS NOT NULL`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE "messages"`);
    await q.query(`DROP TABLE "conversation_members"`);
    await q.query(`DROP TABLE "conversations"`);
    await q.query(`ALTER TABLE "users" DROP COLUMN "lastSeenAt"`);
  }
}
