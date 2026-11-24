import { MigrationInterface, QueryRunner } from 'typeorm';

/** Push tokens, in-app notifications, likes, bookmarks and follows for the mobile app. */
export class MobileFeatures1794200000000 implements MigrationInterface {
  name = 'MobileFeatures1794200000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(
      `CREATE TABLE "devices" ("id" SERIAL NOT NULL, "userId" integer NOT NULL, "token" character varying(255) NOT NULL, "platform" character varying(10) NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "lastSeenAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_devices" PRIMARY KEY ("id"), CONSTRAINT "UQ_devices_token" UNIQUE ("token"), CONSTRAINT "FK_devices_userId" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE)`,
    );
    await q.query(`CREATE INDEX "IDX_devices_userId" ON "devices" ("userId")`);

    await q.query(
      `CREATE TABLE "notifications" ("id" SERIAL NOT NULL, "userId" integer NOT NULL, "type" character varying(30) NOT NULL, "title" character varying(150) NOT NULL, "body" character varying(300) NOT NULL, "data" jsonb, "readAt" TIMESTAMP WITH TIME ZONE, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_notifications" PRIMARY KEY ("id"), CONSTRAINT "FK_notifications_userId" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE)`,
    );
    await q.query(`CREATE INDEX "IDX_notifications_userId_id" ON "notifications" ("userId", "id")`);

    await q.query(
      `CREATE TABLE "post_likes" ("userId" integer NOT NULL, "postId" integer NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_post_likes" PRIMARY KEY ("userId", "postId"), CONSTRAINT "FK_post_likes_userId" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE, CONSTRAINT "FK_post_likes_postId" FOREIGN KEY ("postId") REFERENCES "posts"("id") ON DELETE CASCADE)`,
    );
    await q.query(`CREATE INDEX "IDX_post_likes_postId" ON "post_likes" ("postId")`);

    await q.query(
      `CREATE TABLE "bookmarks" ("id" SERIAL NOT NULL, "userId" integer NOT NULL, "postId" integer NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_bookmarks" PRIMARY KEY ("id"), CONSTRAINT "UQ_bookmarks_user_post" UNIQUE ("userId", "postId"), CONSTRAINT "FK_bookmarks_userId" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE, CONSTRAINT "FK_bookmarks_postId" FOREIGN KEY ("postId") REFERENCES "posts"("id") ON DELETE CASCADE)`,
    );

    await q.query(
      `CREATE TABLE "follows" ("followerId" integer NOT NULL, "followingId" integer NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_follows" PRIMARY KEY ("followerId", "followingId"), CONSTRAINT "CHK_follows_not_self" CHECK ("followerId" <> "followingId"), CONSTRAINT "FK_follows_followerId" FOREIGN KEY ("followerId") REFERENCES "users"("id") ON DELETE CASCADE, CONSTRAINT "FK_follows_followingId" FOREIGN KEY ("followingId") REFERENCES "users"("id") ON DELETE CASCADE)`,
    );
    await q.query(`CREATE INDEX "IDX_follows_followingId" ON "follows" ("followingId")`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE "follows"`);
    await q.query(`DROP TABLE "bookmarks"`);
    await q.query(`DROP TABLE "post_likes"`);
    await q.query(`DROP TABLE "notifications"`);
    await q.query(`DROP TABLE "devices"`);
  }
}
