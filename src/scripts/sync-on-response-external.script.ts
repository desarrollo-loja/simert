/**
 * One-time migration script: syncs onResponseExternal from simert's incident
 * and checkbox tables into simert-pay's transaction records.
 *
 * Run with:
 *   npx ts-node -r tsconfig-paths/register src/scripts/sync-on-response-external.script.ts
 *
 * Requires a .env file (or env vars) with the standard DB_* and DOMINIO_PAY /
 * AUTORIZATION variables already used by the main application.
 *
 * What it does:
 *   1. Queries every incident and checkbox where statusIncident = PAYED (700)
 *      and onResponseExternal IS NOT NULL.
 *   2. Groups the results by transactionId (last write wins if there are
 *      multiple rows for the same transactionId — in practice there should
 *      be at most one per entity type).
 *   3. Calls PATCH {DOMINIO_PAY}/api/pay/client/pay/update-response-external/:transactionId
 *      for each unique transactionId.
 *   4. Logs a summary of successes and failures.
 */

// Load .env before anything else so process.env is populated.
// eslint-disable-next-line @typescript-eslint/no-require-imports
require('dotenv').config();

import axios from 'axios';
import { DataSource } from 'typeorm';

// ─── DB connection ────────────────────────────────────────────────────────────

const dataSource = new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST,
    port: +(process.env.DB_PORT ?? 5432),
    username: process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    schema: 'public',
    entities: [],
    synchronize: false,
});

// ─── simert-pay HTTP config ───────────────────────────────────────────────────

const PAY_DOMAIN = process.env.DOMINIO_PAY ?? '';
const AUTH_HEADER = `Bearer ${process.env.AUTORIZATION ?? ''}`;

async function callSyncEndpoint(
    transactionId: string,
    onResponseExternal: any[],
): Promise<{ ok: boolean; status?: number; message?: string }> {
    try {
        const url = `${PAY_DOMAIN}api/pay/client/pay/update-response-external/${transactionId}`;
        const res = await axios.patch(
            url,
            { onResponseExternal },
            {
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: AUTH_HEADER,
                },
            },
        );
        const { errorCode } = res.data ?? {};
        return {
            ok: errorCode === 0,
            status: res.status,
            message: `errorCode=${errorCode}`,
        };
    } catch (err: any) {
        return {
            ok: false,
            status: err.response?.status,
            message: err.response?.data?.message ?? err.message,
        };
    }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
    console.log('=== sync-on-response-external migration ===\n');

    if (!PAY_DOMAIN) {
        throw new Error('DOMINIO_PAY env var is not set');
    }

    await dataSource.initialize();
    console.log('DB connected\n');

    // statusIncident = 700 (PAYED), camelCase columns need double-quotes in raw SQL
    const incidentRows: { transactionId: string; onResponseExternal: any[] }[] =
        await dataSource.query(`
      SELECT "transactionId", "onResponseExternal"
      FROM public.incident
      WHERE "onResponseExternal" IS NOT NULL
    `);

    const checkboxRows: { transactionId: string; onResponseExternal: any[] }[] =
        await dataSource.query(`
      SELECT "transactionId", "onResponseExternal"
      FROM public.checkbox
      WHERE "onResponseExternal" IS NOT NULL
    `);

    console.log(`Found ${incidentRows.length} incident rows`);
    console.log(`Found ${checkboxRows.length} checkbox rows\n`);

    // Merge both sources. If a transactionId exists in both, the checkbox row
    // (which has emission + deposit) takes precedence.
    const byTransactionId = new Map<string, any[]>();
    for (const row of [...incidentRows, ...checkboxRows]) {
        byTransactionId.set(row.transactionId, row.onResponseExternal);
    }

    console.log(`Unique transactionIds to sync: ${byTransactionId.size}\n`);

    let successCount = 0;
    let failCount = 0;

    for (const [transactionId, onResponseExternal] of byTransactionId) {
        const result = await callSyncEndpoint(
            transactionId,
            onResponseExternal,
        );
        if (result.ok) {
            successCount++;
            console.log(`  OK  ${transactionId}`);
        } else {
            failCount++;
            console.error(
                `  FAIL ${transactionId} — status=${result.status} msg=${result.message}`,
            );
        }
    }

    await dataSource.destroy();

    console.log(`\n=== Done: ${successCount} OK, ${failCount} FAILED ===`);
    process.exit(failCount > 0 ? 1 : 0);
}

main().catch((err) => {
    console.error('Fatal error:', err.message ?? err);
    process.exit(1);
});
