import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { DataSource, EntityManager } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { ContactsService } from '../contacts/contacts.service';
import { ConversationsService } from '../chat/conversations.service';
import { MessagesService } from '../chat/messages.service';
import { PushService } from '../devices/push.service';
import { decodeCursor, encodeCursor } from '../common/cursor';
import { rowsOf } from '../common/rows-of';
import { RealtimeService } from '../realtime/realtime.service';
import { formatNaira, limitFrom } from './money';
import { PAYMENT_PROVIDER, PaymentProvider } from './payment-provider';

interface TxRow {
  id: number;
  reference: string;
  type: 'funding' | 'transfer' | 'reversal';
  status: 'pending' | 'success' | 'failed';
  amount: string;
  fromUserId: number | null;
  toUserId: number | null;
  note: string | null;
  conversationId: string | null;
  createdAt: Date;
  completedAt: Date | null;
}

interface MoveInput {
  type: 'funding' | 'transfer' | 'reversal';
  from: number | null;
  to: number;
  amount: number;
  reference: string;
  note?: string | null;
  key?: string | null;
  conversationId?: string | null;
  reversalOfId?: number;
  /** Funding and admin reversals skip the frozen and limit checks. */
  strict: boolean;
}

const present = (row: TxRow) => ({
  id: row.id,
  reference: row.reference,
  type: row.type,
  status: row.status,
  amount: Number(row.amount),
  currency: 'NGN',
  fromUserId: row.fromUserId,
  toUserId: row.toUserId,
  note: row.note,
  conversationId: row.conversationId,
  createdAt: row.createdAt,
  completedAt: row.completedAt,
});

@Injectable()
export class WalletService {
  constructor(
    @InjectDataSource() private readonly db: DataSource,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
    private readonly config: ConfigService,
    private readonly realtime: RealtimeService,
    private readonly push: PushService,
    private readonly audit: AuditService,
    private readonly conversations: ConversationsService,
    private readonly messages: MessagesService,
    private readonly contacts: ContactsService,
  ) {}

  private get limits() {
    const get = (key: string) => this.config.get(key);
    return {
      minFund: limitFrom(get('WALLET_MIN_FUND_KOBO'), 10_000),
      minTransfer: limitFrom(get('WALLET_MIN_TRANSFER_KOBO'), 100),
      maxTransfer: limitFrom(get('WALLET_MAX_TRANSFER_KOBO'), 50_000_000),
      dailyLimit: limitFrom(get('WALLET_DAILY_LIMIT_KOBO'), 100_000_000),
      maxBalance: limitFrom(get('WALLET_MAX_BALANCE_KOBO'), 500_000_000),
    };
  }

  private async ensureWallet(db: DataSource | EntityManager, userId: number) {
    await db.query(`INSERT INTO wallets ("userId") VALUES ($1) ON CONFLICT DO NOTHING`, [userId]);
  }

  async wallet(me: number) {
    await this.ensureWallet(this.db, me);
    const rows = (await this.db.query(`SELECT balance, "frozenAt" FROM wallets WHERE "userId" = $1`, [me])) as {
      balance: string;
      frozenAt: Date | null;
    }[];
    return {
      balance: Number(rows[0].balance),
      currency: 'NGN',
      frozen: !!rows[0].frozenAt,
      limits: this.limits,
    };
  }

  // ---- The one place money moves ----

  /**
   * Inside a database transaction: lock the wallets (always lowest id first,
   * so two payments in opposite directions cannot deadlock), check the rules,
   * change both balances, and write the transaction and its two ledger entries.
   */
  private async move(tx: EntityManager, input: MoveInput): Promise<TxRow> {
    const ids = [input.from, input.to].filter((id): id is number => id !== null);
    for (const id of ids) await this.ensureWallet(tx, id);
    const locked = (await tx.query(
      `SELECT "userId", balance, "frozenAt" FROM wallets WHERE "userId" = ANY($1) ORDER BY "userId" FOR UPDATE`,
      [ids],
    )) as { userId: number; balance: string; frozenAt: Date | null }[];
    const wallet = (id: number) => locked.find((w) => w.userId === id)!;

    if (input.from !== null) {
      const sender = wallet(input.from);
      if (input.strict && sender.frozenAt) throw new ForbiddenException('Your wallet is frozen. Contact support.');
      if (Number(sender.balance) < input.amount) throw new BadRequestException('Insufficient balance');
      if (input.strict) {
        const today = (await tx.query(
          `SELECT COALESCE(SUM(amount), 0) AS total FROM wallet_transactions
           WHERE "fromUserId" = $1 AND type = 'transfer' AND status = 'success' AND "createdAt" > now() - interval '24 hours'`,
          [input.from],
        )) as { total: string }[];
        if (Number(today[0].total) + input.amount > this.limits.dailyLimit) {
          throw new BadRequestException(`Daily sending limit reached (${formatNaira(this.limits.dailyLimit)})`);
        }
      }
    }
    const receiver = wallet(input.to);
    if (input.strict) {
      if (receiver.frozenAt) throw new ForbiddenException('That person cannot receive money right now');
      if (Number(receiver.balance) + input.amount > this.limits.maxBalance) {
        throw new BadRequestException('That person cannot receive this much right now');
      }
    }

    if (input.from !== null) {
      await tx.query(`UPDATE wallets SET balance = balance - $2 WHERE "userId" = $1`, [input.from, input.amount]);
    }
    await tx.query(`UPDATE wallets SET balance = balance + $2 WHERE "userId" = $1`, [input.to, input.amount]);

    const created = rowsOf<TxRow>(
      await tx.query(
        `INSERT INTO wallet_transactions (reference, type, status, amount, "fromUserId", "toUserId", note,
                "idempotencyKey", "conversationId", "reversalOfId", "completedAt")
         VALUES ($1, $2, 'success', $3, $4, $5, $6, $7, $8, $9, now()) RETURNING *`,
        [
          input.reference,
          input.type,
          input.amount,
          input.from,
          input.to,
          input.note ?? null,
          input.key ?? null,
          input.conversationId ?? null,
          input.reversalOfId ?? null,
        ],
      ),
    )[0];
    // Two entries that add up to zero. userId null is the outside world (the payment provider).
    await tx.query(
      `INSERT INTO ledger_entries ("transactionId", "userId", amount) VALUES ($1, $2, $3), ($1, $4, $5)`,
      [created.id, input.from, -input.amount, input.to, input.amount],
    );
    return created;
  }

  private notify(row: TxRow, title: string) {
    const ids = [row.fromUserId, row.toUserId].filter((id): id is number => id !== null);
    this.realtime.emitToUsers(ids, 'wallet:updated', { transactionId: row.id, type: row.type });
    if (row.toUserId !== null) {
      void this.push.send(row.toUserId, title, `${formatNaira(Number(row.amount))}${row.note ? ` · ${row.note}` : ''}`, {
        type: 'wallet',
        transactionId: row.id,
      });
    }
  }

  // ---- Fund the wallet (card or bank, through the provider) ----

  async fund(me: number, amount: number) {
    const limits = this.limits;
    if (amount < limits.minFund) throw new BadRequestException(`The smallest top-up is ${formatNaira(limits.minFund)}`);
    const current = await this.wallet(me);
    if (current.balance + amount > limits.maxBalance) {
      throw new BadRequestException(`Your wallet can hold at most ${formatNaira(limits.maxBalance)}`);
    }
    const users = (await this.db.query(`SELECT email FROM users WHERE id = $1`, [me])) as { email: string }[];

    const reference = `fund_${randomUUID()}`;
    await this.db.query(
      `INSERT INTO wallet_transactions (reference, type, status, amount, "toUserId") VALUES ($1, 'funding', 'pending', $2, $3)`,
      [reference, amount, me],
    );
    try {
      const { authorizationUrl } = await this.provider.initialize({
        email: users[0].email,
        amountKobo: amount,
        reference,
      });
      return { reference, amount, authorizationUrl };
    } catch (error) {
      await this.db.query(`UPDATE wallet_transactions SET status = 'failed' WHERE reference = $1`, [reference]);
      throw error;
    }
  }

  /**
   * Called by the signed webhook and by "check my payment". It can be called
   * any number of times for one payment: only the first one credits the wallet.
   */
  async settleFunding(reference: string, paidKobo: number, currency: string) {
    const settled = await this.db.transaction(async (tx) => {
      const rows = (await tx.query(
        `SELECT * FROM wallet_transactions WHERE reference = $1 AND type = 'funding' FOR UPDATE`,
        [reference],
      )) as TxRow[];
      const row = rows[0];
      if (!row || row.status !== 'pending') return null;
      if (Number(row.amount) !== paidKobo || currency !== 'NGN') {
        await tx.query(
          `UPDATE wallet_transactions SET status = 'failed', meta = $2, "completedAt" = now() WHERE id = $1`,
          [row.id, JSON.stringify({ reason: 'amount or currency mismatch', paidKobo, currency })],
        );
        return null;
      }
      await this.ensureWallet(tx, row.toUserId!);
      await tx.query(`SELECT 1 FROM wallets WHERE "userId" = $1 FOR UPDATE`, [row.toUserId]);
      await tx.query(`UPDATE wallets SET balance = balance + $2 WHERE "userId" = $1`, [row.toUserId, row.amount]);
      await tx.query(`UPDATE wallet_transactions SET status = 'success', "completedAt" = now() WHERE id = $1`, [row.id]);
      await tx.query(
        `INSERT INTO ledger_entries ("transactionId", "userId", amount) VALUES ($1, NULL, $2), ($1, $3, $4)`,
        [row.id, -Number(row.amount), row.toUserId, Number(row.amount)],
      );
      return { ...row, status: 'success' as const };
    });
    if (settled) this.notify(settled, 'Wallet topped up');
    return { settled: !!settled };
  }

  /** "I paid, where is my money?": ask the provider and settle if it says paid. */
  async checkFunding(me: number, reference: string) {
    const rows = (await this.db.query(
      `SELECT * FROM wallet_transactions WHERE reference = $1 AND type = 'funding' AND "toUserId" = $2`,
      [reference, me],
    )) as TxRow[];
    if (!rows[0]) throw new NotFoundException('Payment not found');
    if (rows[0].status === 'pending') {
      const result = await this.provider.verify(reference);
      if (result?.paid) await this.settleFunding(reference, result.amountKobo, result.currency);
    }
    const fresh = (await this.db.query(`SELECT * FROM wallet_transactions WHERE id = $1`, [rows[0].id])) as TxRow[];
    return { ...present(fresh[0]), balance: (await this.wallet(me)).balance };
  }

  // ---- Send money ----

  async transfer(
    me: number,
    input: { toUserId: number; amount: number; note?: string; key: string; conversationId?: string },
  ) {
    const limits = this.limits;
    if (input.toUserId === me) throw new BadRequestException('You cannot pay yourself');
    if (input.amount < limits.minTransfer) {
      throw new BadRequestException(`The smallest payment is ${formatNaira(limits.minTransfer)}`);
    }
    if (input.amount > limits.maxTransfer) {
      throw new BadRequestException(`The most you can send at once is ${formatNaira(limits.maxTransfer)}`);
    }

    const findExisting = async () =>
      ((await this.db.query(
        `SELECT * FROM wallet_transactions WHERE "fromUserId" = $1 AND "idempotencyKey" = $2`,
        [me, input.key],
      )) as TxRow[])[0];

    const existing = await findExisting();
    if (existing) return this.sameRequest(existing, input);

    const payee = (await this.db.query(
      `SELECT id FROM users WHERE id = $1 AND "isActive" = true AND "deletedAt" IS NULL`,
      [input.toUserId],
    )) as unknown[];
    if (payee.length === 0) throw new NotFoundException('User not found');

    try {
      const row = await this.db.transaction((tx) =>
        this.move(tx, {
          type: 'transfer',
          from: me,
          to: input.toUserId,
          amount: input.amount,
          reference: `pay_${randomUUID()}`,
          note: input.note?.trim() || null,
          key: input.key,
          conversationId: input.conversationId ?? null,
          strict: true,
        }),
      );
      this.notify(row, 'You received money');
      return present(row);
    } catch (error) {
      // The same payment arrived twice at once: the other one won.
      if ((error as { code?: string }).code === '23505') {
        const winner = await findExisting();
        if (winner) return this.sameRequest(winner, input);
      }
      throw error;
    }
  }

  /** A retry must be the same payment. The same key with other details is a mistake, not a retry. */
  private sameRequest(row: TxRow, input: { toUserId: number; amount: number }) {
    if (row.toUserId !== input.toUserId || Number(row.amount) !== input.amount) {
      throw new ConflictException('That idempotencyKey was already used for a different payment');
    }
    return present(row);
  }

  /** Pay the other person of a direct chat. The chat gets a payment message. */
  async payInChat(me: number, conversationId: string, amount: number, note: string | undefined, key: string) {
    await this.conversations.requireMember(conversationId, me);
    const others = (await this.db.query(
      `SELECT m."userId" FROM conversation_members m JOIN conversations c ON c.id = m."conversationId"
       WHERE m."conversationId" = $1 AND c.type = 'direct' AND m."leftAt" IS NULL AND m."userId" <> $2`,
      [conversationId, me],
    )) as { userId: number }[];
    if (others.length !== 1) throw new BadRequestException('You can only pay inside a one-to-one chat');

    const transaction = await this.transfer(me, { toUserId: others[0].userId, amount, note, key, conversationId });
    const body = `Sent ${formatNaira(amount)}${note?.trim() ? ` · ${note.trim()}` : ''}`;
    const message = await this.messages.postPayment(
      me,
      conversationId,
      `pay:${key}`,
      { kind: 'payment', transactionId: transaction.id, amount, currency: 'NGN', note: note?.trim() || null },
      body,
    );
    return { transaction, message };
  }

  /** Who a payment QR code belongs to, so the app can show the name before asking for an amount. */
  async resolveQr(me: number, code: string) {
    return this.contacts.resolve(me, code);
  }

  async payQr(me: number, code: string, amount: number, note: string | undefined, key: string) {
    const payee = await this.contacts.resolve(me, code);
    const chat = await this.conversations.createDirect(me, payee.id);
    return { payee, ...(await this.payInChat(me, chat.id, amount, note, key)) };
  }

  // ---- History ----

  async history(me: number, cursor: string | undefined, limit: number) {
    let before: number | null = null;
    if (cursor) {
      before = decodeCursor(cursor);
      if (before === null) throw new BadRequestException('Invalid cursor');
    }
    const rows = (await this.db.query(
      `SELECT t.*, u.username AS "otherUsername", u.firstname AS "otherFirstname", u.lastname AS "otherLastname"
       FROM wallet_transactions t
       LEFT JOIN users u ON u.id = CASE WHEN t."fromUserId" = $1 THEN t."toUserId" ELSE t."fromUserId" END
       WHERE (t."fromUserId" = $1 OR t."toUserId" = $1) AND ($2::int IS NULL OR t.id < $2) AND t.status <> 'failed'
       ORDER BY t.id DESC LIMIT $3`,
      [me, before, limit + 1],
    )) as (TxRow & { otherUsername: string | null; otherFirstname: string | null; otherLastname: string | null })[];
    const page = rows.slice(0, limit);
    return {
      items: page.map((row) => ({
        ...present(row),
        direction: row.toUserId === me ? 'in' : 'out',
        counterparty: row.otherUsername
          ? { username: row.otherUsername, firstname: row.otherFirstname, lastname: row.otherLastname }
          : null,
      })),
      nextCursor: rows.length > limit ? encodeCursor(page[page.length - 1].id) : null,
    };
  }

  // ---- Staff: freeze, reverse, reconcile ----

  async freeze(adminId: number, userId: number, reason: string) {
    await this.requireUser(userId);
    await this.ensureWallet(this.db, userId);
    await this.db.query(`UPDATE wallets SET "frozenAt" = now(), "frozenReason" = $2 WHERE "userId" = $1`, [
      userId,
      reason.trim(),
    ]);
    await this.audit.record(adminId, 'wallet.freeze', userId, { reason: reason.trim() });
    return { message: 'Wallet frozen' };
  }

  async unfreeze(adminId: number, userId: number, reason: string) {
    await this.requireUser(userId);
    await this.db.query(`UPDATE wallets SET "frozenAt" = NULL, "frozenReason" = NULL WHERE "userId" = $1`, [userId]);
    await this.audit.record(adminId, 'wallet.unfreeze', userId, { reason: reason.trim() });
    return { message: 'Wallet unfrozen' };
  }

  private async requireUser(userId: number) {
    const rows = (await this.db.query(`SELECT 1 FROM users WHERE id = $1`, [userId])) as unknown[];
    if (rows.length === 0) throw new NotFoundException('User not found');
  }

  /** Takes a payment back from the receiver and returns it to the sender, if the money is still there. */
  async reverse(adminId: number, transactionId: number, reason: string) {
    const rows = (await this.db.query(`SELECT * FROM wallet_transactions WHERE id = $1`, [transactionId])) as TxRow[];
    const original = rows[0];
    if (!original || original.type !== 'transfer' || original.status !== 'success') {
      throw new NotFoundException('Only a completed payment between people can be reversed');
    }
    try {
      const reversal = await this.db.transaction((tx) =>
        this.move(tx, {
          type: 'reversal',
          from: original.toUserId,
          to: original.fromUserId!,
          amount: Number(original.amount),
          reference: `rev_${original.id}`,
          note: 'Reversal',
          reversalOfId: original.id,
          strict: false,
        }),
      );
      await this.audit.record(adminId, 'wallet.reverse', original.fromUserId, {
        transactionId,
        amount: Number(original.amount),
        reason: reason.trim(),
      });
      this.notify(reversal, 'A payment was reversed');
      return present(reversal);
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === '23505') throw new ConflictException('This payment was already reversed');
      if ((error as Error).message === 'Insufficient balance') {
        throw new ConflictException('The receiver has already spent this money');
      }
      throw error;
    }
  }

  /** Proof the books are right: every balance equals its ledger, and every transaction adds up to zero. */
  async reconcile() {
    const wallets = await this.db.query(
      `SELECT w."userId", w.balance::text AS balance, COALESCE(SUM(e.amount), 0)::text AS ledger
       FROM wallets w LEFT JOIN ledger_entries e ON e."userId" = w."userId"
       GROUP BY w."userId", w.balance HAVING w.balance <> COALESCE(SUM(e.amount), 0)`,
    );
    const unbalanced = await this.db.query(
      `SELECT "transactionId", SUM(amount)::text AS total FROM ledger_entries GROUP BY "transactionId" HAVING SUM(amount) <> 0`,
    );
    const totals = (await this.db.query(
      `SELECT (SELECT COALESCE(SUM(balance), 0) FROM wallets)::text AS "inWallets",
              (SELECT COALESCE(-SUM(amount), 0) FROM ledger_entries WHERE "userId" IS NULL)::text AS "fundedFromOutside"`,
    )) as { inWallets: string; fundedFromOutside: string }[];
    return {
      ok: wallets.length === 0 && unbalanced.length === 0 && totals[0].inWallets === totals[0].fundedFromOutside,
      walletMismatches: wallets,
      unbalancedTransactions: unbalanced,
      totals: { inWallets: Number(totals[0].inWallets), fundedFromOutside: Number(totals[0].fundedFromOutside) },
    };
  }

  webhookSecret(): string {
    const secret = this.config.get<string>('PAYSTACK_SECRET_KEY');
    if (!secret) throw new ServiceUnavailableException('Payments are not configured');
    return secret;
  }
}
