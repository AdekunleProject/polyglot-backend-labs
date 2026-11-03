"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AddPostsPublishedIndex1793686612248 = void 0;
class AddPostsPublishedIndex1793686612248 {
    name = 'AddPostsPublishedIndex1793686612248';
    async up(queryRunner) {
        await queryRunner.query(`CREATE INDEX "IDX_posts_published_createdAt" ON "posts"  ("published", "createdAt") `);
    }
    async down(queryRunner) {
        await queryRunner.query(`DROP INDEX "public"."IDX_posts_published_createdAt"`);
    }
}
exports.AddPostsPublishedIndex1793686612248 = AddPostsPublishedIndex1793686612248;
//# sourceMappingURL=1793686612248-AddPostsPublishedIndex.js.map