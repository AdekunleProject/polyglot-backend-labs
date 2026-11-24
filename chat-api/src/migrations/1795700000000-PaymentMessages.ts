import { MigrationInterface, QueryRunner } from 'typeorm';

/** Payments (and later calls) appear in a chat as messages of their own kind. */
export class PaymentMessages1795700000000 implements MigrationInterface {
  name = 'PaymentMessages1795700000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "messages" DROP CONSTRAINT "CHK_messages_type"`);
    await q.query(
      `ALTER TABLE "messages" ADD CONSTRAINT "CHK_messages_type" CHECK ("type" IN ('text', 'image', 'file', 'voice', 'video', 'system', 'payment', 'call'))`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DELETE FROM "messages" WHERE "type" IN ('payment', 'call')`);
    await q.query(`ALTER TABLE "messages" DROP CONSTRAINT "CHK_messages_type"`);
    await q.query(
      `ALTER TABLE "messages" ADD CONSTRAINT "CHK_messages_type" CHECK ("type" IN ('text', 'image', 'file', 'voice', 'video', 'system'))`,
    );
  }
}
