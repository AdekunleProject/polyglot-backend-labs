import { MigrationInterface, QueryRunner } from "typeorm";
export declare class AddPostsPublishedIndex1793686612248 implements MigrationInterface {
    name: string;
    up(queryRunner: QueryRunner): Promise<void>;
    down(queryRunner: QueryRunner): Promise<void>;
}
