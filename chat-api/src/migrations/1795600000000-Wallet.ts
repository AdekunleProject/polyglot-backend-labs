import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Money. Amounts are whole kobo, never decimals. Every movement writes
 * ledger entries that add up to zero, and a wallet's balance must equal the
 * sum of its entries (the reconcile report checks this).
 */
export class Wallet1795600000000 implements MigrationInterface {
  name = 'Wallet1795600000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(
      `CREATE TABLE "wallets" (
        "userId" integer NOT NULL,
        "balance" bigint NOT NULL DEFAULT 0,
        "frozenAt" TIMESTAMP WITH TIME ZONE,
        "frozenReason" character varying(300),
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_wallets" PRIMARY KEY ("userId"),
        CONSTRAINT "CHK_wallets_balance" CHECK ("balance" >= 0)
      )`,
    );
    await q.query(
      `CREATE TABLE "wallet_transactions" (
        "id" SERIAL NOT NULL,
        "reference" character varying(80) NOT NULL,
        "type" character varying(12) NOT NULL,
        "status" character varying(10) NOT NULL,
        "amount" bigint NOT NULL,
        "fromUserId" integer,
        "toUserId" integer,
        "note" character varying(200),
        "idempotencyKey" character varying(64),
        "conversationId" uuid,
        "reversalOfId" integer,
        "meta" jsonb,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "completedAt" TIMESTAMP WITH TIME ZONE,
        CONSTRAINT "PK_wallet_transactions" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_wallet_transactions_reference" UNIQUE ("reference"),
        CONSTRAINT "CHK_wallet_transactions_amount" CHECK ("amount" > 0)
      )`,
    );
    await q.query(
      `CREATE UNIQUE INDEX "UQ_wallet_tx_idempotency" ON "wallet_transactions" ("fromUserId", "idempotencyKey") WHERE "idempotencyKey" IS NOT NULL`,
    );
    await q.query(
      `CREATE UNIQUE INDEX "UQ_wallet_tx_reversal" ON "wallet_transactions" ("reversalOfId") WHERE "reversalOfId" IS NOT NULL`,
    );
    await q.query(`CREATE INDEX "IDX_wallet_tx_from" ON "wallet_transactions" ("fromUserId", "id")`);
    await q.query(`CREATE INDEX "IDX_wallet_tx_to" ON "wallet_transactions" ("toUserId", "id")`);
    await q.query(
      `CREATE TABLE "ledger_entries" (
        "id" SERIAL NOT NULL,
        "transactionId" integer NOT NULL,
        "userId" integer,
        "amount" bigint NOT NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_ledger_entries" PRIMARY KEY ("id")
      )`,
    );
    await q.query(`CREATE INDEX "IDX_ledger_tx" ON "ledger_entries" ("transactionId")`);
    await q.query(`CREATE INDEX "IDX_ledger_user" ON "ledger_entries" ("userId")`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE "ledger_entries"`);
    await q.query(`DROP TABLE "wallet_transactions"`);
    await q.query(`DROP TABLE "wallets"`);
  }
}
