import { MigrationInterface, QueryRunner } from 'typeorm';

/** A lock on the app for one signed-in device: its own passcode, optional Face ID or fingerprint. */
export class AppLock1796000000000 implements MigrationInterface {
  name = 'AppLock1796000000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(
      `CREATE TABLE "app_locks" (
        "sessionId" uuid NOT NULL,
        "userId" integer NOT NULL,
        "passcodeHash" character varying(100) NOT NULL,
        "biometric" boolean NOT NULL DEFAULT false,
        "autoLockSeconds" integer NOT NULL DEFAULT 60,
        "locked" boolean NOT NULL DEFAULT false,
        "failedAttempts" integer NOT NULL DEFAULT 0,
        "lockedUntil" TIMESTAMP WITH TIME ZONE,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_app_locks" PRIMARY KEY ("sessionId"),
        CONSTRAINT "FK_app_locks_session" FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_app_locks_user" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "CHK_app_locks_auto" CHECK ("autoLockSeconds" IN (0, 30, 60, 300, 900, 3600))
      )`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE "app_locks"`);
  }
}
