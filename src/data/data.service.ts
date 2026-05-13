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

                }

                const allIncidentIds = incidentIdsToTransfer.map((e: { id: number }) => e.id);
                await queryRunner.query(
                    `DELETE FROM public.incident WHERE id = ANY($1)`,
                    [allIncidentIds]
                );
            }

            // ================= FRACTION =================
            //
            // IMPORTANTE: este bloque DEBE ejecutarse DESPUÉS del bloque INCIDENT.
            //
            // ¿Por qué? `incident.fractionId` tiene FK contra `fraction.id`. Si intentamos
            // borrar una fraction mientras un incident en `public.incident` aún la referencia,
            // Postgres lanza:
            //   "update or delete on table 'fraction' violates foreign key constraint
            //    'FK_ae7b75ff1436d9226b118e8e062' on table 'incident'".
            //
            // Estrategia:
            //   1) Primero corre el bloque INCIDENT y borra de `public.incident` los que
            //      ya se movieron a histórica (estados finales: PAYED, CANCELED, etc.).
            //   2) En este punto, `public.incident` SOLO contiene incidents "vivos"
            //      (no aptos para histórica todavía).
            //   3) Aquí seleccionamos fractions del rango EXCLUYENDO aquellas que aún
            //      tengan algún incident vivo apuntándolas (NOT EXISTS). Esas fractions
            //      quedan en `public.fraction` y se moverán en una corrida futura, cuando
            //      su incident pase a estado final y viaje a histórica.
            //   4) Las fractions cuyo incident ya viajó a histórica (o que nunca tuvieron
            //      incident) sí pasan el filtro y se transfieren ahora.
            //
            // Todo ocurre dentro de la misma transacción, así que el SELECT ve los efectos
            // del DELETE previo de incidents.
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
                [from, to]
            );

            // Agrupamos por año/mes del campo `register` (igual que en el bloque INCIDENT)
            // para enrutar cada fraction a su tabla histórica correcta
            // (ej: history."2025_01_fraction", history."2025_03_fraction").
            // Antes esto no se hacía y todas iban a la tabla del mes "actual - 2 días",
            // lo cual era incorrecto cuando se reprocesaban fractions viejas.
            if (fractionIdsToTransfer.length > 0) {

                const groupedByMonth = fractionIdsToTransfer.reduce(
                    (acc: Record<string, number[]>, row: { id: number; tableSuffix: string }) => {
                        if (!acc[row.tableSuffix]) acc[row.tableSuffix] = [];
                        acc[row.tableSuffix].push(row.id);
                        return acc;
                    },
                    {}
                );

                for (const [suffix, ids] of Object.entries(groupedByMonth) as [string, number[]][]) {
                    const targetFractionStatus = `"${suffix}_fraction_status"`;
                    const targetFraction = `"${suffix}_fraction"`;

                    // Aseguramos que existan las tablas históricas del mes que toca.
                    // Las del mes "actual - 2 días" ya se crearon al inicio, pero si
                    // procesamos fractions de meses anteriores, sus tablas pueden no existir.
                    await queryRunner.query(`CREATE TABLE IF NOT EXISTS history.${targetFractionStatus} (LIKE public.fraction_status INCLUDING ALL)`);
                    await queryRunner.query(`CREATE TABLE IF NOT EXISTS history.${targetFraction} (LIKE public.fraction INCLUDING ALL)`);

                    // Insertamos primero fraction_status y luego fraction.
                    // El orden de INSERT no importa para FKs (ambas tablas históricas son
                    // independientes), pero lo mantenemos consistente con el flujo.
                    await queryRunner.query(
                        `INSERT INTO history.${targetFractionStatus}
                        SELECT * FROM public.fraction_status
                        WHERE "fractionId" = ANY($1)`,
                        [ids]
                    );

                    await queryRunner.query(
                        `INSERT INTO history.${targetFraction}
                        SELECT * FROM public.fraction
                        WHERE id = ANY($1)`,
                        [ids]
                    );
                }

                // DELETE final, todos los IDs de una sola pasada.
                // ORDEN CRÍTICO: primero fraction_status (la hija), luego fraction (la padre),
                // porque fraction_status.fractionId tiene FK contra fraction.id.
                // Si invertimos el orden, Postgres lanza FK violation.
                const allFractionIds = fractionIdsToTransfer.map((e: { id: number }) => e.id);

                await queryRunner.query(
                    `DELETE FROM public.fraction_status WHERE "fractionId" = ANY($1)`,
                    [allFractionIds]
                );

                await queryRunner.query(
                    `DELETE FROM public.fraction WHERE id = ANY($1)`,
                    [allFractionIds]
                );
            }

            // ================= CHECKBOX =================
            // Agrupar por año/mes del campo `register` para rutear a la tabla histórica correcta
            // ej: history."2025_01_checkbox", history."2025_03_checkbox"
            if (checkboxIdsToTransfer.length > 0) {

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
