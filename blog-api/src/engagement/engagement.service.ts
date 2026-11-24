import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { decodeCursor, encodeCursor } from '../common/cursor';
import { NotificationsService } from '../notifications/notifications.service';
import { Post } from '../posts/entities/post.entity';
import { Tag } from '../tags/entities/tag.entity';
import { User } from '../users/entities/user.entity';

type Rows = Record<string, unknown>[];

@Injectable()
export class EngagementService {
  constructor(
    @InjectRepository(Post) private readonly posts: Repository<Post>,
    @InjectRepository(Tag) private readonly tags: Repository<Tag>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly notifications: NotificationsService,
  ) {}

  private async publishedPost(postId: number) {
    const post = await this.posts.findOne({
      where: { id: postId, published: true },
      relations: { author: true },
    });
    if (!post) throw new NotFoundException(`Post ${postId} not found`);
    return post;
  }

  private async count(table: 'post_likes', column: string, id: number) {
    const rows = (await this.posts.query(
      `SELECT COUNT(*)::int AS count FROM ${table} WHERE "${column}" = $1`,
      [id],
    )) as { count: number }[];
    return rows[0].count;
  }

  // ---- Likes ----

  /** Liking twice is fine. The author is told only the first time. */
  async like(userId: number, postId: number) {
    const post = await this.publishedPost(postId);
    const inserted = (await this.posts.query(
      `INSERT INTO post_likes ("userId", "postId") VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING "userId"`,
      [userId, postId],
    )) as Rows;
    if (inserted.length > 0 && post.author.id !== userId) {
      await this.notifications.notify(post.author.id, 'like', 'Someone liked your post', post.title, {
        postId,
        slug: post.slug,
        userId,
      });
    }
    return { liked: true, likeCount: await this.count('post_likes', 'postId', postId) };
  }

  async unlike(userId: number, postId: number) {
    await this.posts.query(`DELETE FROM post_likes WHERE "userId" = $1 AND "postId" = $2`, [userId, postId]);
    return { liked: false, likeCount: await this.count('post_likes', 'postId', postId) };
  }

  // ---- Bookmarks ----

  async bookmark(userId: number, postId: number) {
    await this.publishedPost(postId);
    await this.posts.query(
      `INSERT INTO bookmarks ("userId", "postId") VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [userId, postId],
    );
    return { bookmarked: true };
  }

  async unbookmark(userId: number, postId: number) {
    await this.posts.query(`DELETE FROM bookmarks WHERE "userId" = $1 AND "postId" = $2`, [userId, postId]);
    return { bookmarked: false };
  }

  /** Saved posts, newest save first. */
  async bookmarks(userId: number, cursor: string | undefined, limit: number) {
    const before = cursor ? decodeCursor(cursor) : null;
    const rows = (await this.posts.query(
      `SELECT b.id AS "bookmarkId", b."postId" FROM bookmarks b
       JOIN posts p ON p.id = b."postId" AND p.published = true
       WHERE b."userId" = $1 AND ($2::int IS NULL OR b.id < $2)
       ORDER BY b.id DESC LIMIT $3`,
      [userId, before, limit + 1],
    )) as { bookmarkId: number; postId: number }[];
    const page = rows.slice(0, limit);
    const items = await this.cards(page.map((row) => row.postId));
    return {
      items,
      nextCursor: rows.length > limit ? encodeCursor(page[page.length - 1].bookmarkId) : null,
    };
  }

  /** Which of these posts has this person liked or saved? One call for a whole screen. */
  async states(userId: number, postIds: number[]) {
    const ids = [...new Set(postIds)].slice(0, 100);
    if (ids.length === 0) return {};
    const [likes, saved] = await Promise.all([
      this.posts.query(`SELECT "postId" FROM post_likes WHERE "userId" = $1 AND "postId" = ANY($2)`, [userId, ids]),
      this.posts.query(`SELECT "postId" FROM bookmarks WHERE "userId" = $1 AND "postId" = ANY($2)`, [userId, ids]),
    ]);
    const liked = new Set((likes as { postId: number }[]).map((r) => r.postId));
    const bookmarked = new Set((saved as { postId: number }[]).map((r) => r.postId));
    return Object.fromEntries(ids.map((id) => [id, { liked: liked.has(id), bookmarked: bookmarked.has(id) }]));
  }

  // ---- Follows ----

  private async activeUser(userId: number) {
    const user = await this.users.findOne({ where: { id: userId, deletedAt: IsNull(), isActive: true } });
    if (!user) throw new NotFoundException(`User ${userId} not found`);
    return user;
  }

  async follow(followerId: number, targetId: number) {
    if (followerId === targetId) throw new BadRequestException('You cannot follow yourself');
    const target = await this.activeUser(targetId);
    const inserted = (await this.users.query(
      `INSERT INTO follows ("followerId", "followingId") VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING "followerId"`,
      [followerId, targetId],
    )) as Rows;
    if (inserted.length > 0) {
      const me = await this.users.findOneBy({ id: followerId });
      await this.notifications.notify(
        target.id,
        'follow',
        'New follower',
        `${me?.firstname ?? 'Someone'} ${me?.lastname ?? ''}`.trim() + ' started following you',
        { userId: followerId },
      );
    }
    return { following: true };
  }

  async unfollow(followerId: number, targetId: number) {
    await this.users.query(`DELETE FROM follows WHERE "followerId" = $1 AND "followingId" = $2`, [
      followerId,
      targetId,
    ]);
    return { following: false };
  }

  /** What a profile screen shows: public details and counts. */
  async profile(id: number, viewerId?: number) {
    const user = await this.activeUser(id);
    const rows = (await this.users.query(
      `SELECT
         (SELECT COUNT(*)::int FROM posts WHERE "authorId" = $1 AND published = true) AS "postCount",
         (SELECT COUNT(*)::int FROM follows WHERE "followingId" = $1) AS "followerCount",
         (SELECT COUNT(*)::int FROM follows WHERE "followerId" = $1) AS "followingCount",
         EXISTS (SELECT 1 FROM follows WHERE "followerId" = $2 AND "followingId" = $1) AS "followedByMe"`,
      [id, viewerId ?? null],
    )) as Record<string, unknown>[];
    return {
      id: user.id,
      firstname: user.firstname,
      lastname: user.lastname,
      bio: user.bio,
      ...rows[0],
    };
  }

  // ---- Feed ----

  /**
   * Published posts, newest first, a page at a time. Pass back `nextCursor` to
   * get the next page. With `followedBy`, only posts from people that person
   * follows. `updatedSince` returns only posts changed after that time, so a
   * phone can refresh what it has stored.
   */
  async feed(options: {
    cursor?: string;
    limit: number;
    followedBy?: number;
    authorId?: number;
    updatedSince?: Date;
  }) {
    const before = options.cursor ? decodeCursor(options.cursor) : null;
    if (options.cursor && before === null) throw new BadRequestException('Invalid cursor');

    const qb = this.posts
      .createQueryBuilder('post')
      .select('post.id', 'id')
      .where('post.published = true');
    if (before !== null) qb.andWhere('post.id < :before', { before });
    if (options.authorId) qb.andWhere('post.authorId = :authorId', { authorId: options.authorId });
    if (options.updatedSince) qb.andWhere('post.updatedAt > :since', { since: options.updatedSince });
    if (options.followedBy) {
      qb.andWhere('post.authorId IN (SELECT f."followingId" FROM follows f WHERE f."followerId" = :me)', {
        me: options.followedBy,
      });
    }
    const rows = await qb.orderBy('post.id', 'DESC').limit(options.limit + 1).getRawMany<{ id: number }>();
    const page = rows.slice(0, options.limit);
    return {
      items: await this.cards(page.map((row) => row.id)),
      nextCursor: rows.length > options.limit ? encodeCursor(page[page.length - 1].id) : null,
    };
  }

  /** The small version of each post a list screen needs, in the order asked for. */
  private async cards(ids: number[]) {
    if (ids.length === 0) return [];
    const [posts, tagRows, likeRows, commentRows] = await Promise.all([
      this.posts.find({ where: { id: In(ids) }, relations: { author: true } }),
      this.tags
        .createQueryBuilder('tag')
        .innerJoin('tag.posts', 'p')
        .select(['tag.name AS name', 'p.id AS "postId"'])
        .where('p.id IN (:...ids)', { ids })
        .getRawMany<{ name: string; postId: number }>(),
      this.posts.query(
        `SELECT "postId", COUNT(*)::int AS count FROM post_likes WHERE "postId" = ANY($1) GROUP BY "postId"`,
        [ids],
      ) as Promise<{ postId: number; count: number }[]>,
      this.posts.query(
        `SELECT "postId", COUNT(*)::int AS count FROM comments WHERE "postId" = ANY($1) GROUP BY "postId"`,
        [ids],
      ) as Promise<{ postId: number; count: number }[]>,
    ]);
    const byId = new Map(posts.map((p) => [p.id, p]));
    const likes = new Map(likeRows.map((r) => [r.postId, r.count]));
    const comments = new Map(commentRows.map((r) => [r.postId, r.count]));
    return ids
      .map((id) => byId.get(id))
      .filter((post): post is Post => !!post)
      .map((post) => ({
        id: post.id,
        slug: post.slug,
        title: post.title,
        excerpt: post.content.slice(0, 200),
        createdAt: post.createdAt,
        updatedAt: post.updatedAt,
        author: {
          id: post.author.id,
          firstname: post.author.firstname,
          lastname: post.author.lastname,
        },
        tags: tagRows.filter((t) => t.postId === post.id).map((t) => t.name),
        likeCount: likes.get(post.id) ?? 0,
        commentCount: comments.get(post.id) ?? 0,
      }));
  }
}
