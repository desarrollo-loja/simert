import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import handleDbExceptions from 'src/common/exceptions/error.db.exception';
import { StatusFraction } from 'src/common/glob/status/status_fraction';
import { Repository } from 'typeorm';

import { Status } from './entities/status.entity';

/**
 * Service for managing Status seed records — the static lookup table that
 * maps {@link StatusFraction} enum values to display names. Used primarily
 * during database initialization.
 */
@Injectable()
export class StatusService {
  private readonly logger = new Logger('StatusService');

  constructor(
    @InjectRepository(Status)
    private readonly statusRepository: Repository<Status>,
  ) { }

  /**
   * Seeds the status lookup table with all known {@link StatusFraction} values.
   * Intended for one-time database initialization; subsequent calls are idempotent
   * when the repository uses upsert/save semantics.
   *
   * @returns The first two created status entities.
   */
  async initializeDatabase() {
    const status1 = this.statusRepository.create({ id: StatusFraction.REQUESTED, name: 'Solicitando' });
    await this.statusRepository.save(status1);

    const status2 = this.statusRepository.create({ id: StatusFraction.ACTIVE, name: 'Activo' });
    await this.statusRepository.save(status2);

    const status3 = this.statusRepository.create({ id: StatusFraction.INCREMENTED, name: 'Tiempo aumentado' });
    await this.statusRepository.save(status3);

    const status4 = this.statusRepository.create({ id: StatusFraction.EXCEEDED_TIME, name: 'Tiempo exedido' });
    await this.statusRepository.save(status4);

    const status5 = this.statusRepository.create({ id: StatusFraction.SANCTIONED, name: 'Dancionado' });
    await this.statusRepository.save(status5);

    const status6 = this.statusRepository.create({ id: StatusFraction.FINISHED, name: 'Terminada' });
    await this.statusRepository.save(status6);

    const status7 = this.statusRepository.create({ id: StatusFraction.FINISHED_BY_INCREMENT, name: 'Termiando incremento' });
    await this.statusRepository.save(status7);

    const status8 = this.statusRepository.create({ id: StatusFraction.ERROR, name: 'Error' });
    await this.statusRepository.save(status8);

    const status9 = this.statusRepository.create({ id: StatusFraction.NEXT_TO_EXCEEDED_TIME, name: 'Proximo a caducar' });
    await this.statusRepository.save(status9);

    const status10 = this.statusRepository.create({ id: StatusFraction.FINISHED_BY_OPERATOR, name: 'Terminada OP con T' });
    await this.statusRepository.save(status10);

    const status11 = this.statusRepository.create({ id: StatusFraction.FINISHED_BY_CONTROLLER, name: 'Terminada OP exedido' });
    await this.statusRepository.save(status11);

    return { status1, status2 };
  }

  /**
   * Returns all status records with id and name fields.
   *
   * @returns Object with the status array.
   */
  async findAllByfilter() {
    try {
      const status = await this.statusRepository.createQueryBuilder('st')
        .select(['st.id', 'st.name'])
        .getMany();
      return { status };
    } catch (error) {
      handleDbExceptions(error, this.logger);
    }
  }
}
