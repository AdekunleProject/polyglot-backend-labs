"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const typeorm_1 = require("typeorm");
const comment_entity_1 = require("./comments/entities/comment.entity");
const post_entity_1 = require("./posts/entities/post.entity");
const tag_entity_1 = require("./tags/entities/tag.entity");
const user_entity_1 = require("./users/entities/user.entity");
exports.default = new typeorm_1.DataSource({
    type: 'postgres',
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    username: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    entities: [user_entity_1.User, post_entity_1.Post, tag_entity_1.Tag, comment_entity_1.Comment],
    migrations: ['src/migrations/*.ts'],
});
//# sourceMappingURL=data-source.js.map