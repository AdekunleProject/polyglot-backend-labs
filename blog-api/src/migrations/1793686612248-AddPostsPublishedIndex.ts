import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPostsPublishedIndex1793686612248 implements MigrationInterface {
  name = 'AddPostsPublishedIndex1793686612248';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE INDEX "IDX_posts_published_createdAt" ON "posts"  ("published", "createdAt") `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_posts_published_createdAt"`,
    );
  }
}
