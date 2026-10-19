// What is a migration for?
// Your database structure (tables, columns, constraints) needs to change as your app grows 
// A migration is a file that describes one change to that structure, written as SQL. Each file runs once, 
// in order, and TypeORM records it in the migrations table so it never runs twice.
// Without migrations, you’d edit tables by hand or let synchronize: true guess. Both are risky:
// By hand: you forget what you changed, and your laptop, your teammate’s laptop, and the production server all end up with different tables.
// synchronize: true: TypeORM guesses the changes and can drop a column with real data in it.
// With migrations, anyone can clone your repo, run pnpm migration:run, and get the exact same database,
// built step by step. The history lives in git, like your code. It’s the same idea as your numbered 
// 01-users-todos.sql, 02-queries.sql files, but automated and tracked.

// Each migration also has a down method that undoes the change, so a mistake can be rolled back with 
// pnpm migration:revert.

// What is the number in the file name?
// Something like 1760888000000-InitialSchema.ts. That number is a timestamp: the time the file was 
// generated, in milliseconds since 1 January 1970 (the standard way computers count time).
// It exists for ordering. TypeORM runs migrations from the smallest number to the largest, so they always 
// apply in the order you created them. A later migration can safely depend on an earlier one. For example, the isPinned migration needs the notes table to exist first, and its larger number guarantees that.

// The same number also appears in the class name inside the file (InitialSchema1760888000000). 
// TypeORM stores that name in the migrations table to remember what already ran. 
// Never rename or edit a migration that has already run on a database. Instead, create a new one.


import { MigrationInterface, QueryRunner } from "typeorm";

export class InitialSchema1792421004980 implements MigrationInterface {
    name = 'InitialSchema1792421004980'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "notes" ("id" SERIAL NOT NULL, "title" character varying(200) NOT NULL, "content" text NOT NULL, "createdAt" TIMESTAMP NOT NULL DEFAULT now(), "userId" integer NOT NULL, CONSTRAINT "PK_af6206538ea96c4e77e9f400c3d" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "users" ("id" SERIAL NOT NULL, "name" character varying(100) NOT NULL, "email" character varying(150) NOT NULL, CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE ("email"), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))`);
        await queryRunner.query(`ALTER TABLE "notes" ADD CONSTRAINT "FK_829532ff766505ad7c71592c6a5" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "notes" DROP CONSTRAINT "FK_829532ff766505ad7c71592c6a5"`);
        await queryRunner.query(`DROP TABLE "users"`);
        await queryRunner.query(`DROP TABLE "notes"`);
    }

}
