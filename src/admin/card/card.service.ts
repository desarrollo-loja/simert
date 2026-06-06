import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import handleDbExceptions from 'src/common/exceptions/error.db.exception';
import { TypeOperation } from 'src/common/glob/type/type_operation';
import { LoggerService } from 'src/common/logger.service.ts';
import { Repository } from 'typeorm';

import { FilterDto } from '../../common/dto/filter.dto';
import { CreateCardDto } from './dto/create-card.dto';
import { UpdateCardDto } from './dto/update-card.dto';
import { Card } from './entities/card.entity';

/**
 * Service for managing physical parking Cards — the leaf entity in the
 * Bank → Card hierarchy. Provides CRUD operations and audit logging via
 * {@link LoggerService}.
 */
@Injectable()
export class CardService {
  private readonly logger = new Logger('CardService');

  /**
   *
   * @param cardRepository
   * @param loggerService
   */
  constructor(
    @InjectRepository(Card)
    private readonly cardRepository: Repository<Card>,

    @Inject(LoggerService)
    private readonly loggerService: LoggerService,
  ) {}

  /**
   * Creates a new card record and writes a CREATE audit log entry.
   *
   * @param userId - ID of the user performing the action (for audit logging).
   * @param createCardDto - Payload with card name, price, commission and checkbox count.
   * @returns Object containing the newly created card.
   * @throws Rethrows database errors via handleDbExceptions.
   */
  async create(userId: number, createCardDto: CreateCardDto) {
    try {
      let card = this.cardRepository.create({ ...createCardDto });
      card = await this.cardRepository.save(card);
      this.loggerService.saveCardLogger({
        id: card.id,
        userId,
        typeOperation: TypeOperation.CREATE,
        card,
      });
      return { card };
    } catch (error) {
      handleDbExceptions(error, this.logger);
    }
  }

  /**
   * Returns a paginated list of card records, optionally filtered by name
   * using a case-insensitive partial match.
   *
   * Limit and offset are coerced to numbers to avoid TypeORM SQL syntax errors
   * when the query-string values arrive as strings.
   *
   * @param filterDto - Filter and pagination options: search, limit, offset.
   * @returns Object with the cards array and the applied offset/limit values.
   * @throws Rethrows database errors via handleDbExceptions.
   */
  async findAll(filterDto: FilterDto) {
    const { search } = filterDto;

    // Coerce to numbers for pagination (prevents "syntax error at or near '3'")
    const take = Number(filterDto.limit) || 20;
    const skip = Number(filterDto.offset) || 0;

    try {
      const query = this.cardRepository
        .createQueryBuilder('c')
        .select([
          'c.id',
          'c.name',
          'c.price',
          'c.commission',
          'c.checkboxes',
          'c.isActivated',
        ])
        .orderBy('c.id', 'DESC')
        .take(take)
        .skip(skip);

      if (search) {
        query.andWhere('c.name ILIKE :search', { search: `%${search}%` });
      }

      const card = await query.getMany();

      return { card, offset: skip, limit: take };
    } catch (error) {
      handleDbExceptions(error, this.logger);
    }
  }

  /**
   * Returns the total count of card records, optionally filtered by name using
   * a case-insensitive partial match.
   *
   * @param filterDto - Filter options: search.
   * @returns Object containing the numeric total count.
   * @throws Rethrows database errors via handleDbExceptions.
   */
  async findAllTotal(filterDto: FilterDto) {
    const { search } = filterDto;

    try {
      const query = this.cardRepository.createQueryBuilder('c');

      if (search) {
        query.andWhere('c.name ILIKE :search', { search: `%${search}%` });
      }

      const total = await query.getCount();
      return { total };
    } catch (error) {
      handleDbExceptions(error, this.logger);
    }
  }

  /**
   * Applies a partial update to an existing card record and writes an UPDATE
   * audit log entry.
   *
   * @param id - Primary key of the card to update.
   * @param updateCardDto - Fields to update on the card record.
   * @returns Object containing the updated card, or undefined if the record was not found.
   * @throws Rethrows database errors via handleDbExceptions.
   */
  async update(id: number, updateCardDto: UpdateCardDto) {
    try {
      const card = await this.cardRepository.preload({ id, ...updateCardDto });
      if (card) {
        await this.cardRepository.save(card);
        this.loggerService.saveCardLogger({
          id: card.id,
          typeOperation: TypeOperation.UPDATE,
          card,
        });
        return { card };
      }
    } catch (error) {
      handleDbExceptions(error, this.logger);
    }
  }
}
