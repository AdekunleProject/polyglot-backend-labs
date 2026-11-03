"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InitialSchema1793684055122 = void 0;
class InitialSchema1793684055122 {
    name = 'InitialSchema1793684055122';
    async up(queryRunner) {
        await queryRunner.query(`CREATE TABLE "tags" ("id" SERIAL NOT NULL, "name" character varying(30) NOT NULL, CONSTRAINT "UQ_d90243459a697eadb8ad56e9092" UNIQUE ("name"), CONSTRAINT "PK_e7dc17249a1148a1970748eda99" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "users" ("id" SERIAL NOT NULL, "name" character varying(100) NOT NULL, "email" character varying(150) NOT NULL, "password" character varying NOT NULL, "role" character varying(20) NOT NULL DEFAULT 'user', CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE ("email"), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "posts" ("id" SERIAL NOT NULL, "title" character varying(200) NOT NULL, "slug" character varying(220) NOT NULL, "content" text NOT NULL, "published" boolean NOT NULL DEFAULT false, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP NOT NULL DEFAULT now(), "authorId" integer NOT NULL, CONSTRAINT "UQ_54ddf9075260407dcfdd7248577" UNIQUE ("slug"), CONSTRAINT "PK_2829ac61eff60fcec60d7274b9e" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "comments" ("id" SERIAL NOT NULL, "content" text NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "postId" integer NOT NULL, "authorId" integer NOT NULL, CONSTRAINT "PK_8bf68bc960f2b69e818bdb90dcb" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "posts_tags_tags" ("postsId" integer NOT NULL, "tagsId" integer NOT NULL, CONSTRAINT "PK_0102fd077ecbe473388af8f3358" PRIMARY KEY ("postsId", "tagsId"))`);
        await queryRunner.query(`CREATE INDEX "IDX_cf364c7e6905b285c4b55a0034" ON "posts_tags_tags"  ("postsId") `);
        await queryRunner.query(`CREATE INDEX "IDX_ce163a967812183a51b044f740" ON "posts_tags_tags"  ("tagsId") `);
        await queryRunner.query(`ALTER TABLE "posts" ADD CONSTRAINT "FK_c5a322ad12a7bf95460c958e80e" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "comments" ADD CONSTRAINT "FK_e44ddaaa6d058cb4092f83ad61f" FOREIGN KEY ("postId") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "comments" ADD CONSTRAINT "FK_4548cc4a409b8651ec75f70e280" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "posts_tags_tags" ADD CONSTRAINT "FK_cf364c7e6905b285c4b55a00343" FOREIGN KEY ("postsId") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE`);
        await queryRunner.query(`ALTER TABLE "posts_tags_tags" ADD CONSTRAINT "FK_ce163a967812183a51b044f7404" FOREIGN KEY ("tagsId") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE`);
    }
    async down(queryRunner) {
        await queryRunner.query(`ALTER TABLE "posts_tags_tags" DROP CONSTRAINT "FK_ce163a967812183a51b044f7404"`);
        await queryRunner.query(`ALTER TABLE "posts_tags_tags" DROP CONSTRAINT "FK_cf364c7e6905b285c4b55a00343"`);
        await queryRunner.query(`ALTER TABLE "comments" DROP CONSTRAINT "FK_4548cc4a409b8651ec75f70e280"`);
        await queryRunner.query(`ALTER TABLE "comments" DROP CONSTRAINT "FK_e44ddaaa6d058cb4092f83ad61f"`);
        await queryRunner.query(`ALTER TABLE "posts" DROP CONSTRAINT "FK_c5a322ad12a7bf95460c958e80e"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_ce163a967812183a51b044f740"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_cf364c7e6905b285c4b55a0034"`);
        await queryRunner.query(`DROP TABLE "posts_tags_tags"`);
        await queryRunner.query(`DROP TABLE "comments"`);
        await queryRunner.query(`DROP TABLE "posts"`);
        await queryRunner.query(`DROP TABLE "users"`);
        await queryRunner.query(`DROP TABLE "tags"`);
    }
}
exports.InitialSchema1793684055122 = InitialSchema1793684055122;
//# sourceMappingURL=1793684055122-InitialSchema.js.map