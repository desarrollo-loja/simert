import { Injectable, Logger } from '@nestjs/common';
import { StatusPayment } from 'src/common/glob/status/status_payment';
import { IncidentStatus } from 'src/common/glob/type/type_incident';
import { DataSource } from 'typeorm';

@Injectable()
export class DataService {
    constructor(private readonly dataSource: DataSource) { }

    private readonly logger = new Logger('DataService');

    async onModuleInit() {
        if (process.env.MASTER_DATA_SERVICE === 'TRUE') {
            this.logger.verbose('MASTER >>> start call onModuleInit MASTER_DATA_SERVICE');
            setInterval(() => {
                const now = new Date();
                const hourUTC = now.getUTCHours();
                // Definir horas permitidas en UTC
                //const isPeakHour = (hourUTC >= 7 && hourUTC <= 10)
                const isPeakHour = true
                if (isPeakHour) {
                    this._transferData();
                }
            }, 1 * 60 * 1000); // Cada 2 minutos
        }
    }

    private async _transferData(): Promise<void> {

        this.logger.verbose('Dentro de la funcion para pasar datos a las historicas')

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

            const { table, from, to } = fecha;

            const tableFractionStatus = `"${table}_fraction_status"`;
            const tableFraction = `"${table}_fraction"`;
            const tableCheckbox = `"${table}_checkbox"`;
            const tableIncident = `"${table}_incident"`;

            // ✅ CREATE TABLE LIKE versión PostgreSQL
            await queryRunner.query(`CREATE TABLE IF NOT EXISTS history.${tableFractionStatus} (LIKE public.fraction_status INCLUDING ALL)`);
            await queryRunner.query(`CREATE TABLE IF NOT EXISTS history.${tableFraction} (LIKE public.fraction INCLUDING ALL)`);

            await queryRunner.query(`CREATE TABLE IF NOT EXISTS history.${tableCheckbox} (LIKE public.checkbox INCLUDING ALL)`);

            await queryRunner.query(`CREATE TABLE IF NOT EXISTS history.${tableIncident} (LIKE public.incident INCLUDING ALL)`);

            // ✅ Obtener IDs de incidents
            // Solo transferimos incidentes en estado final (resueltos, pagados, cancelados, etc.)
            // Filtramos solo por `to` (sin from) para capturar incidentes antiguos que recién completaron su ciclo
            const incidentIdsToTransfer = await queryRunner.query(
                `
                SELECT id, to_char(register, 'YYYY_MM') AS "tableSuffix"
                FROM public.incident
                WHERE register <= $1
                AND "statusIncident" = ANY($2)
                ORDER BY register ASC
                LIMIT 5000
                `,
                [to, [
                    IncidentStatus.APPEALED,
                    IncidentStatus.ERRONEOUS,
                    IncidentStatus.CANCELED,
                    IncidentStatus.CANCELED_BY_SUPERVISOR,
                    IncidentStatus.CONVENIO,
                    IncidentStatus.ON_CREDIT,
                    IncidentStatus.PENDIENTE_LIQUIDACION,
                    IncidentStatus.PAYED,
                ]]
            );

            // ✅ Obtener IDs de fractions
            const fractionIdsToTransfer = await queryRunner.query(
                `SELECT id FROM public.fraction WHERE register BETWEEN $1 AND $2 LIMIT 5000`,
                [from, to]
            );

            // ✅ Obtener IDs de checkboxes
            // SOLO PASAMOS A HISTÓRICAS LOS QUE ESTÉN PAGADOS INTERNAMENTE Y YA CONSTE EL PAGO EN EL GIM
            // Filtramos solo por `to` (sin from) para capturar checkboxes antiguos que recién completaron su ciclo
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
                [to, StatusPayment.PAID, IncidentStatus.PAYED, StatusPayment.ERROR]
            );

            // ================= INCIDENT =================
            // Agrupar por año/mes del campo `register` para rutear a la tabla histórica correcta
            if (incidentIdsToTransfer.length > 0) {

                this.logger.log('incidentIdsToTransfer', incidentIdsToTransfer.length);
                const groupedByMonth = incidentIdsToTransfer.reduce(
                    (acc: Record<string, number[]>, row: { id: number; tableSuffix: string }) => {
                        if (!acc[row.tableSuffix]) acc[row.tableSuffix] = [];
                        acc[row.tableSuffix].push(row.id);
                        return acc;
                    },
                    {}
                );

                for (const [suffix, ids] of Object.entries(groupedByMonth) as [string, number[]][]) {
                    const targetTable = `"${suffix}_incident"`;

                    //await queryRunner.query(`CREATE TABLE IF NOT EXISTS history.${targetTable} (LIKE public.incident INCLUDING ALL)`);

                    const incidents = await queryRunner.query(`SELECT * FROM public.incident
                        WHERE id = ANY($1)`, [ids]);


                    await queryRunner.query(
                        `INSERT INTO history.${targetTable}
                        SELECT * FROM public.incident
                        WHERE id = ANY($1)`,
                        [ids]
                    );

                    this.logger.log(`[_transferData] Incident: ${ids.length} registros → history.${targetTable}`);
                }

                const allIncidentIds = incidentIdsToTransfer.map((e: { id: number }) => e.id);
                await queryRunner.query(
                    `DELETE FROM public.incident WHERE id = ANY($1)`,
                    [allIncidentIds]
                );
            }

            // ================= FRACTION =================
            if (fractionIdsToTransfer.length > 0) {

                this.logger.log('fractionIdsToTransfer', fractionIdsToTransfer.length);
                const fractionIds = fractionIdsToTransfer.map((e) => e.id);

                await queryRunner.query(`
                INSERT INTO history.${tableFractionStatus}
                SELECT * FROM public.fraction_status
                WHERE "fractionId" = ANY($1)
            `, [fractionIds]);

                await queryRunner.query(`
                INSERT INTO history.${tableFraction}
                SELECT * FROM public.fraction
                WHERE id = ANY($1)
            `, [fractionIds]);

                await queryRunner.query(`
                DELETE FROM public.fraction_status
                WHERE "fractionId" = ANY($1)
            `, [fractionIds]);

                await queryRunner.query(`
                DELETE FROM public.fraction
                WHERE id = ANY($1)
            `, [fractionIds]);
            }

            // ================= CHECKBOX =================
            // Agrupar por año/mes del campo `register` para rutear a la tabla histórica correcta
            // ej: history."2025_01_checkbox", history."2025_03_checkbox"
            if (checkboxIdsToTransfer.length > 0) {

                this.logger.log('checkboxIdsToTransfer', checkboxIdsToTransfer.length);
                const groupedByMonth = checkboxIdsToTransfer.reduce(
                    (acc: Record<string, number[]>, row: { id: number; tableSuffix: string }) => {
                        if (!acc[row.tableSuffix]) acc[row.tableSuffix] = [];
                        acc[row.tableSuffix].push(row.id);
                        return acc;
                    },
                    {}
                );

                for (const [suffix, ids] of Object.entries(groupedByMonth) as [string, number[]][]) {
                    const targetTable = `"${suffix}_checkbox"`;

                    // Insertar el grupo en su tabla correcta
                    await queryRunner.query(
                        `INSERT INTO history.${targetTable}
                        SELECT * FROM public.checkbox
                        WHERE id = ANY($1)`,
                        [ids]
                    );

                    this.logger.log(`[_transferData] Checkbox: ${ids.length} registros → history.${targetTable}`);
                }

                // Borrar todos los procesados en un solo DELETE
                const allCheckboxIds = checkboxIdsToTransfer.map((e: { id: number }) => e.id);
                await queryRunner.query(
                    `DELETE FROM public.checkbox WHERE id = ANY($1)`,
                    [allCheckboxIds]
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
