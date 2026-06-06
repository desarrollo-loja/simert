import { Injectable, Logger } from '@nestjs/common';
import { StatusPayment } from 'src/common/glob/status/status_payment';
import { IncidentStatus } from 'src/common/glob/type/type_incident';
import { DataSource } from 'typeorm';

/**
 * Service that owns the periodic data-archiving job: moves closed
 * fractions, incidents and related rows from the live tables into
 * monthly historical partitions (`<table>_yyyy_mm`) and prunes the
 * source tables once foreign-key constraints allow it.
 *
 * Run from a scheduled task; not exposed via HTTP. Activated only on
 * the master instance via the `MASTER_DATA_SERVICE` env flag.
 */
@Injectable()
export class DataService {
  /**
   *
   * @param dataSource
   */
  constructor(private readonly dataSource: DataSource) {}

  private readonly logger = new Logger('DataService');

  /**
   *
   */
  async onModuleInit() {
    if (process.env.MASTER_DATA_SERVICE === 'TRUE') {
      this.logger.verbose(
        'MASTER >>> start call onModuleInit MASTER_DATA_SERVICE',
      );
      setInterval(
        () => {
          // Define allowed hours in UTC
          //const isPeakHour = (hourUTC >= 7 && hourUTC <= 10)
          const isPeakHour = true;
          if (isPeakHour) {
            this._transferData();
          }
        },
        1 * 60 * 1000,
      ); // Every minute
    }
  }

  /**
   *
   */
  private async _transferData(): Promise<void> {
    this.logger.verbose(
      'Dentro de la funcion para pasar datos a las historicas',
    );

    const queryRunner = this.dataSource.createQueryRunner();

    try {
      await queryRunner.connect();
      await queryRunner.startTransaction();

      // ✅ Fecha en PostgreSQL
      const [fecha] = await queryRunner.query(`
            SELECT 
                to_char(current_date - interval '2 day', 'YYYY-MM-DD 00:00:00') AS "from",
                to_char(current_date - interval '2 day', 'YYYY-MM-DD 23:59:59') AS "to",
                to_char(current_date - interval '2 day', 'YYYY_MM') AS "table"
        `);

      const { table, to } = fecha;

      const tableFractionStatus = `"${table}_fraction_status"`;
      const tableFraction = `"${table}_fraction"`;
      const tableCheckbox = `"${table}_checkbox"`;
      const tableIncident = `"${table}_incident"`;

      // CREATE TABLE LIKE — PostgreSQL form
      await queryRunner.query(
        `CREATE TABLE IF NOT EXISTS history.${tableFractionStatus} (LIKE public."fractionStatus" INCLUDING ALL)`,
      );
      await queryRunner.query(
        `CREATE TABLE IF NOT EXISTS history.${tableFraction} (LIKE public.fraction INCLUDING ALL)`,
      );

      await queryRunner.query(
        `CREATE TABLE IF NOT EXISTS history.${tableCheckbox} (LIKE public.checkbox INCLUDING ALL)`,
      );

      await queryRunner.query(
        `CREATE TABLE IF NOT EXISTS history.${tableIncident} (LIKE public.incident INCLUDING ALL)`,
      );

      // Collect incident IDs to transfer.
      // Only incidents in a FINAL state are moved (resolved, paid, canceled, ...).
      // Filter only by `to` (no `from`) so older incidents that just finished their cycle are picked up too.
      const incidentIdsToTransfer = await queryRunner.query(
        `
                SELECT id, to_char(register, 'YYYY_MM') AS "tableSuffix"
                FROM public.incident
                WHERE register <= $1
                AND "statusIncident" = ANY($2)
                ORDER BY register ASC
                LIMIT 5000
                `,
        [
          to,
          [
            IncidentStatus.APPEALED,
            IncidentStatus.ERRONEOUS,
            IncidentStatus.CANCELED,
            IncidentStatus.CANCELED_BY_SUPERVISOR,
            IncidentStatus.CONVENIO,
            IncidentStatus.ON_CREDIT,
            IncidentStatus.PENDIENTE_LIQUIDACION,
            IncidentStatus.PAYED,
          ],
        ],
      );

      // Collect checkbox IDs to transfer.
      // Move to history ONLY those paid internally AND already settled in GIM.
      // Filter only by `to` (no `from`) so older checkboxes that just finished their cycle are picked up too.
      const checkboxIdsToTransfer = await queryRunner.query(
        `
                SELECT id, to_char(register, 'YYYY_MM') AS "tableSuffix"
                FROM public.checkbox
                WHERE register <= $1
                AND (
                    ("statusPayment" = $2 AND "statusIncident" = $3)
                    OR "statusPayment" = $4
                )
                ORDER BY register ASC
                LIMIT 5000
                `,
        [to, StatusPayment.PAID, IncidentStatus.PAYED, StatusPayment.ERROR],
      );

      // ================= INCIDENT =================
      // Group by year/month of the `register` field so each row is routed
      // to the correct historical table.
      if (incidentIdsToTransfer.length > 0) {
        const groupedByMonth = incidentIdsToTransfer.reduce(
          (
            acc: Record<string, number[]>,
            row: { id: number; tableSuffix: string },
          ) => {
            if (!acc[row.tableSuffix]) acc[row.tableSuffix] = [];
            acc[row.tableSuffix].push(row.id);
            return acc;
          },
          {},
        );

        for (const [suffix, ids] of Object.entries(groupedByMonth) as [
          string,
          number[],
        ][]) {
          const targetTable = `"${suffix}_incident"`;

          //await queryRunner.query(`CREATE TABLE IF NOT EXISTS history.${targetTable} (LIKE public.incident INCLUDING ALL)`);

          const _incidents = await queryRunner.query(
            `SELECT * FROM public.incident
                        WHERE id = ANY($1)`,
            [ids],
          );

          await queryRunner.query(
            `INSERT INTO history.${targetTable}
                        SELECT * FROM public.incident
                        WHERE id = ANY($1)`,
            [ids],
          );
        }

        const allIncidentIds = incidentIdsToTransfer.map(
          (e: { id: number }) => e.id,
        );
        await queryRunner.query(
          `DELETE FROM public.incident WHERE id = ANY($1)`,
          [allIncidentIds],
        );
      }

      // ================= FRACTION =================
      //
      // IMPORTANT: this block MUST run AFTER the INCIDENT block.
      //
      // Why? `incident.fractionId` has an FK against `fraction.id`. If we try to
      // delete a fraction while an incident in `public.incident` still references it,
      // Postgres raises:
      //   "update or delete on table 'fraction' violates foreign key constraint
      //    'FK_ae7b75ff1436d9226b118e8e062' on table 'incident'".
      //
      // Strategy:
      //   1) Run the INCIDENT block first and delete from `public.incident` all the
      //      rows already moved to history (final states: PAYED, CANCELED, etc.).
      //   2) At this point `public.incident` ONLY contains "live" incidents
      //      (not yet eligible for history).
      //   3) Here we pick fractions in the range EXCLUDING those still referenced
      //      by any live incident (NOT EXISTS). Those fractions remain in
      //      `public.fraction` and will be moved in a future run, once their
      //      incident reaches a final state and travels to history.
      //   4) Fractions whose incident already went to history (or that never had
      //      one) pass the filter and are transferred now.
      //
      // Everything happens inside the same transaction, so the SELECT sees the
      // effects of the previous incident DELETE.
      const fractionIdsToTransfer = await queryRunner.query(
        `
                SELECT f.id, to_char(f.register, 'YYYY_MM') AS "tableSuffix"
                FROM public.fraction f
                WHERE register <= $1
                AND NOT EXISTS (
                    SELECT 1 FROM public.incident i WHERE i."fractionId" = f.id
                )
                ORDER BY f.register ASC
                LIMIT 5000
                `,
        [to],
      );

      // Group by year/month of the `register` field (same as the INCIDENT block)
      // so each fraction is routed to its correct historical table
      // (e.g. history."2025_01_fraction", history."2025_03_fraction").
      // Previously this was not done and every row went to the table for
      // "current month - 2 days", which was wrong when reprocessing old fractions.
      if (fractionIdsToTransfer.length > 0) {
        const groupedByMonth = fractionIdsToTransfer.reduce(
          (
            acc: Record<string, number[]>,
            row: { id: number; tableSuffix: string },
          ) => {
            if (!acc[row.tableSuffix]) acc[row.tableSuffix] = [];
            acc[row.tableSuffix].push(row.id);
            return acc;
          },
          {},
        );

        for (const [suffix, ids] of Object.entries(groupedByMonth) as [
          string,
          number[],
        ][]) {
          const targetFractionStatus = `"${suffix}_fraction_status"`;
          const targetFraction = `"${suffix}_fraction"`;

          // Make sure the historical tables for the correct month exist.
          // The "current - 2 days" tables were created at the top, but when
          // reprocessing fractions from earlier months their tables may not exist yet.
          await queryRunner.query(
            `CREATE TABLE IF NOT EXISTS history.${targetFractionStatus} (LIKE public."fractionStatus" INCLUDING ALL)`,
          );
          await queryRunner.query(
            `CREATE TABLE IF NOT EXISTS history.${targetFraction} (LIKE public.fraction INCLUDING ALL)`,
          );

          // Insert fraction_status first, then fraction.
          // INSERT order does not matter for FKs (both historical tables are
          // independent), but we keep it consistent with the rest of the flow.
          await queryRunner.query(
            `INSERT INTO history.${targetFractionStatus}
                        SELECT * FROM public."fractionStatus"
                        WHERE "fractionId" = ANY($1)`,
            [ids],
          );

          await queryRunner.query(
            `INSERT INTO history.${targetFraction}
                        SELECT * FROM public.fraction
                        WHERE id = ANY($1)`,
            [ids],
          );
        }

        // Final DELETE, all IDs in a single pass.
        // CRITICAL ORDER: fraction_status (child) first, then fraction (parent),
        // because fraction_status.fractionId has an FK against fraction.id.
        // Inverting the order would cause an FK violation.
        const allFractionIds = fractionIdsToTransfer.map(
          (e: { id: number }) => e.id,
        );

        await queryRunner.query(
          `DELETE FROM public."fractionStatus" WHERE "fractionId" = ANY($1)`,
          [allFractionIds],
        );

        await queryRunner.query(
          `DELETE FROM public.fraction WHERE id = ANY($1)`,
          [allFractionIds],
        );
      }

      // ================= CHECKBOX =================
      // Group by year/month of the `register` field so each row is routed
      // to the correct historical table
      // (e.g. history."2025_01_checkbox", history."2025_03_checkbox").
      if (checkboxIdsToTransfer.length > 0) {
        const groupedByMonth = checkboxIdsToTransfer.reduce(
          (
            acc: Record<string, number[]>,
            row: { id: number; tableSuffix: string },
          ) => {
            if (!acc[row.tableSuffix]) acc[row.tableSuffix] = [];
            acc[row.tableSuffix].push(row.id);
            return acc;
          },
          {},
        );

        for (const [suffix, ids] of Object.entries(groupedByMonth) as [
          string,
          number[],
        ][]) {
          const targetTable = `"${suffix}_checkbox"`;

          // Insert the group into its correct table
          await queryRunner.query(
            `INSERT INTO history.${targetTable}
                        SELECT * FROM public.checkbox
                        WHERE id = ANY($1)`,
            [ids],
          );
        }

        // Delete every processed row in a single DELETE
        const allCheckboxIds = checkboxIdsToTransfer.map(
          (e: { id: number }) => e.id,
        );
        await queryRunner.query(
          `DELETE FROM public.checkbox WHERE id = ANY($1)`,
          [allCheckboxIds],
        );
      }

      await queryRunner.commitTransaction();
    } catch (err) {
      if (queryRunner.isTransactionActive)
        await queryRunner.rollbackTransaction();
      this.logger.error(`Call _transferData err: ${err}`);
    } finally {
      await queryRunner.release();
    }
  }
}
