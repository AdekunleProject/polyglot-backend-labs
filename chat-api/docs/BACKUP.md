# Backups

There are two kinds, for two different jobs.

## 1. A person's own backup (built in)

`POST /backups` with `{ "password": "..." }` starts an export of that person's chats: the people in them
and every message they can see (deleted messages are left out). The archive is encrypted with AES-256-GCM, with a key
made from the password (scrypt). The server never stores the password, so **a lost password means
the backup cannot be opened**. Files are described (name, type, size), not copied: they stay in storage
for as long as the chat exists.

`GET /backups/:id` returns a download link once `status` is `ready`. The newest 5 backups are kept.

To open one on your own computer:

    node scripts/decrypt-backup.mjs my.chatbackup "my password" > chats.json

Not built yet: restoring a backup into the app (the app would read the archive) and automatic scheduled
backups. A schedule needs a key the server can use without the person, which a password-only
design deliberately avoids.

## 2. A backup of the whole database (you run it)

Run this from a scheduled job (a Kubernetes CronJob, or cron on the server). It is not part of the API.

    pg_dump --format=custom --no-owner "$DATABASE_URL" \
      | aws s3 cp - "s3://$BACKUP_BUCKET/db/$(date +%F).dump" --sse AES256

- Keep 30 daily copies with an S3 lifecycle rule.
- Turn on versioning and block public access on the bucket.
- **Test a restore** now and then into an empty database:
  `pg_restore --clean --no-owner -d "$TEST_DATABASE_URL" file.dump`. A backup you never restored is a guess.
- The chat media in S3 needs bucket versioning (or cross-region replication) as its own protection.
