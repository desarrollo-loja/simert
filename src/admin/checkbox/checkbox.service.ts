import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import handleDbExceptions from 'src/common/exceptions/error.db.exception';
import { Repository } from 'typeorm';

import { FilterDto } from '../../common/dto/filter.dto';
import { ErrorCode } from '../../common/glob/error';
import { StatusPayment } from '../../common/glob/status/status_payment';
import { IncidentStatus } from '../../common/glob/type/type_incident';
import { Checkbox } from './entities/checkbox.entity';

@Injectable()
export class CheckboxService {
  private readonly logger = new Logger('CheckboxService');

  constructor(
    @InjectRepository(Checkbox)
    private readonly checkboxRepository: Repository<Checkbox>,
  ) { }

  async findAll(filterDto: FilterDto) {
    const {
      offset: rawOffset = 0,
      limit: rawLimit = 10,
      year,
      month
    } = filterDto;
    // Defense-in-depth: coerce pagination to safe non-negative integers
    // even if class-validator was bypassed upstream.
    const safeLimit = Number.isFinite(Number(rawLimit)) && Number(rawLimit) >= 0
      ? Math.trunc(Number(rawLimit))
      : 10;
    const safeOffset = Number.isFinite(Number(rawOffset)) && Number(rawOffset) >= 0
      ? Math.trunc(Number(rawOffset))
      : 0;
    try {
      let tableName = 'checkbox';
      let tableExists = false;
      // Only treat year/month as usable when both are integers in a sane range.
      // This blocks SQL injection via interpolation of `${year}_${month}_checkbox`.
      const y = Number(year);
      const m = Number(month);
      const validYearMonth =
        Number.isInteger(y) && y >= 2000 && y <= 2100 &&
        Number.isInteger(m) && m >= 1 && m <= 12;
      if (year && month && validYearMonth) {
        const mm = String(m).padStart(2, '0');
        tableName = `${y}_${mm}_checkbox`;
        tableExists = await this._tableExists(tableName);
      } else if (year || month) {
        // Invalid year/month supplied: deny historical lookup.
        return { checkbox: [] };
      }

      const { conditions, parameters } = this._buildConditionsAndParameters(filterDto);

      if (tableExists || (!year && !month)) {
        let query = `
          SELECT c.id,
          c."userId", c."transactionId", c.checkboxes, c.amount,
          c.moment, c."statusPayment", c."typePaymentMethod",
          c.billing_data, c."cardId",
          TO_CHAR(c."createdAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS') AS "createdAt",
          TO_CHAR(c."updatedAt", 'YYYY-MM-DD"T"HH24:MI:SS.MS') AS "updatedAt",
          c."statusIncident"
          FROM ${tableName} c
        `;

        if (conditions.length > 0) {
          query += ' WHERE ' + conditions.join(' AND ');
        }

        const totalQuery = `SELECT COUNT(*) AS total FROM ${tableName} AS c` + (conditions.length > 0 ? ' WHERE ' + conditions.join(' AND ') : '');
        const totalResult = await this.checkboxRepository.query(totalQuery, parameters);
        const total = totalResult[0].total;

        parameters.push(safeLimit, safeOffset);
        const paramLimit = parameters.length - 1;
        const paramOffset = parameters.length;

        query += ` ORDER BY c.id DESC LIMIT $${paramLimit} OFFSET $${paramOffset};`;

        const checkbox = await this.checkboxRepository.query(query, parameters);

        return {
          checkbox,
          total,
          limit: safeLimit,
          offset: safeOffset,
        };
      } else {
        return {
          checkbox: []
        }
      }
    } catch (error) {
      handleDbExceptions(error, this.logger);
    }
    return `This action returns all checkbox`;
  }

  private async _tableExists(tableName: string): Promise<boolean> {
    const query = `
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      AND table_name = $1
    ) AS "exists";
  `;
    try {
      const result = await this.checkboxRepository.query(query, [tableName]);
      return result[0].exists;
    } catch (error) {
      return false;
    }
  }

  private _buildConditionsAndParameters(
    filterDto: FilterDto
  ): { conditions: string[]; parameters: any[] } {
    const {
      search,
      statusMomentId,
      statusPayment,
      typePaymentMethod,
      dateFrom,
      dateTo,
    } = filterDto;

    const conditions: string[] = [];
    const parameters: any[] = [];

    if (search) {
      parameters.push(search);
      conditions.push(`c."transactionId" = $${parameters.length}`);
    }

    if (statusMomentId) {
      parameters.push(statusMomentId);
      conditions.push(`c.moment = $${parameters.length}`);
    }

    if (statusPayment) {
      parameters.push(statusPayment);
      conditions.push(`c."statusPayment" = $${parameters.length}`);
    }

    if (typePaymentMethod) {
      parameters.push(typePaymentMethod);
      conditions.push(`c."typePaymentMethod" = $${parameters.length}`);
    }

    if (dateFrom && dateTo) {
      parameters.push(dateFrom, dateTo);
      conditions.push(
        `DATE(c.register) BETWEEN $${parameters.length - 1} AND $${parameters.length}`
      );
    }

    return { conditions, parameters };
  }

  // ─── Endpoints consumed by CommonCheckboxService via HTTP ──────────────

  /**
   * Returns PAID checkboxes whose statusIncident is NULL
   * (pending emission + deposit in GIM).
   */
  async findPaidWithoutIncident(): Promise<{ errorCode: ErrorCode; data: Checkbox[] }> {
    try {
      const rows = await this.checkboxRepository.query(
        `SELECT * FROM public.checkbox
         WHERE "statusPayment" = $1
           AND "statusIncident" IS NULL`,
        [StatusPayment.PAID],
      );
      return { errorCode: ErrorCode.NONE, data: rows };
    } catch (error) {
      this.logger.error(`findPaidWithoutIncident error: ${error.message}`);
      return { errorCode: ErrorCode.HTTP_ERROR_REINTENT, data: [] };
    }
  }

  /**
   * Returns PAID checkboxes whose statusIncident is in an intermediate state:
   * ENTERED, APPROVED, CONVENIO, ON_CREDIT, PENDIENTE_LIQUIDACION or SUPPLIED.
   */
  async findPaidWithPendingIncident(): Promise<{ errorCode: ErrorCode; data: Checkbox[] }> {
    try {
      const pendingStatuses = [
        IncidentStatus.ENTERED,
        IncidentStatus.APPROVED,
        IncidentStatus.CONVENIO,
        IncidentStatus.ON_CREDIT,
        IncidentStatus.PENDIENTE_LIQUIDACION,
        IncidentStatus.SUPPLIED,
      ];
      const placeholders = pendingStatuses.map((_, i) => `$${i + 2}`).join(', ');
      const rows = await this.checkboxRepository.query(
        `SELECT * FROM public.checkbox
         WHERE "statusPayment" = $1
           AND "statusIncident" IN (${placeholders})`,
        [StatusPayment.PAID, ...pendingStatuses],
      );
      return { errorCode: ErrorCode.NONE, data: rows };
    } catch (error) {
      this.logger.error(`findPaidWithPendingIncident error: ${error.message}`);
      return { errorCode: ErrorCode.HTTP_ERROR_REINTENT, data: [] };
    }
  }

  /**
   * Updates a checkbox by its id.
   * Receives a partial object with the fields to modify (excluding 'id').
   */
  async updateCheckboxById(id: number, fields: Partial<Checkbox>): Promise<{ errorCode: ErrorCode; data: any; message: string }> {
    try {
      await this.checkboxRepository.update(id, fields);
      return { errorCode: ErrorCode.NONE, data: [], message: 'Checkbox actualizado correctamente' };
    } catch (error) {
      this.logger.error(`updateCheckboxById error: ${error.message}`);
      return { errorCode: ErrorCode.HTTP_ERROR_REINTENT, data: [], message: 'Error al actualizar el checkbox' };
    }
  }

  /**
   * Transfers a checkbox to the corresponding historical table
   * history."YYYY_MM_checkbox" based on its createdAt date.
   */
  async moveCheckboxToHistory(id: number): Promise<{ errorCode: ErrorCode; data: any; message: string }> {
    try {
      const rows = await this.checkboxRepository.query(
        `SELECT id, "createdAt" FROM public.checkbox WHERE id = $1`,
        [id],
      );
      const current = rows?.[0];

      if (!current?.createdAt) {
        return { errorCode: ErrorCode.NOT_FOUND, data: [], message: 'No se encontró el checkbox' };
      }

      const date = new Date(current.createdAt);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const tableCheckbox = `history."${year}_${month}_checkbox"`;

      const existsResult = await this.checkboxRepository.query(
        `SELECT EXISTS(
           SELECT 1 FROM information_schema.tables
           WHERE table_schema = $1 AND table_name = $2
         ) AS "exists"`,
        ['history', `${year}_${month}_checkbox`],
      );

      if (!existsResult[0]?.exists) {
        return { errorCode: ErrorCode.NONE, data: [], message: 'No se encontró la tabla histórica para transferir el checkbox' };
      }

      await this.checkboxRepository.query(
        `INSERT INTO ${tableCheckbox} SELECT * FROM public.checkbox WHERE id = $1`,
        [id],
      );

      return { errorCode: ErrorCode.NONE, data: [], message: 'Checkbox transferido correctamente' };
    } catch (error) {
      this.logger.error(`moveCheckboxToHistory error: ${error.message}`);
      return { errorCode: ErrorCode.HTTP_ERROR_REINTENT, data: [], message: 'Error al transferir el checkbox' };
    }
  }

}
