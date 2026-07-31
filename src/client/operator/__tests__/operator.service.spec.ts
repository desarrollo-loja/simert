import { BadRequestException } from '@nestjs/common';
import { ErrorCode } from 'src/common/glob/error';
import { StatusFraction } from 'src/common/glob/status/status_fraction';
import { StatusSlot } from 'src/common/glob/status/status_slot';
import { TypeFraction } from 'src/common/glob/type/type_fraction';
import { IncidentCategory } from 'src/common/glob/type/type_incident';

jest.mock('src/common/exceptions/error.db.exception', () => ({
  __esModule: true,
  default: jest.fn((error: any) => {
    throw error;
  }),
}));
import handleDbExceptions from 'src/common/exceptions/error.db.exception';

import { OperatorService } from '../operator.service';

const buildQb = (overrides: Partial<Record<string, any>> = {}) => {
  const qb: any = {
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    innerJoin: jest.fn().mockReturnThis(),
    innerJoinAndSelect: jest.fn().mockReturnThis(),
    leftJoin: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    getOne: jest.fn(),
    getMany: jest.fn(),
    getRawOne: jest.fn(),
    getCount: jest.fn(),
    getRawAndEntities: jest.fn(),
    ...overrides,
  };
  return qb;
};

const buildRepo = () => {
  const qb = buildQb();
  return {
    __qb: qb,
    createQueryBuilder: jest.fn(() => qb),
    create: jest.fn((dto: any) => ({ ...dto })),
    save: jest.fn(async (e: any) => ({ id: 100, ...e })),
    findOne: jest.fn(),
    update: jest.fn(),
    query: jest.fn(),
  };
};

const buildDataSource = () => {
  const qr: any = {
    connect: jest.fn().mockResolvedValue(undefined),
    startTransaction: jest.fn().mockResolvedValue(undefined),
    commitTransaction: jest.fn().mockResolvedValue(undefined),
    rollbackTransaction: jest.fn().mockResolvedValue(undefined),
    release: jest.fn().mockResolvedValue(undefined),
    isTransactionActive: true,
    manager: {
      findOne: jest.fn(),
      save: jest.fn(async (e: any) => ({ id: 1, ...e })),
    },
  };
  return {
    __qr: qr,
    createQueryRunner: jest.fn(() => qr),
  };
};

describe('OperatorService', () => {
  let service: OperatorService;
  let fractionRepo: ReturnType<typeof buildRepo>;
  let blockOperatorRepo: ReturnType<typeof buildRepo>;
  let slotRepo: ReturnType<typeof buildRepo>;
  let fractionStatusRepo: ReturnType<typeof buildRepo>;
  let physicRepo: ReturnType<typeof buildRepo>;
  let zoneRepo: ReturnType<typeof buildRepo>;
  let rangeRepo: ReturnType<typeof buildRepo>;
  let checkboxUserRepo: ReturnType<typeof buildRepo>;
  let incidentRepo: ReturnType<typeof buildRepo>;
  let incidentTypeRepo: ReturnType<typeof buildRepo>;
  let commonService: any;
  let commonCacheService: any;
  let dinardapAntService: any;
  let dataSource: ReturnType<typeof buildDataSource>;
  let gimService: any;
  let loggerService: any;

  beforeEach(() => {
    fractionRepo = buildRepo();
    blockOperatorRepo = buildRepo();
    slotRepo = buildRepo();
    fractionStatusRepo = buildRepo();
    physicRepo = buildRepo();
    zoneRepo = buildRepo();
    rangeRepo = buildRepo();
    checkboxUserRepo = buildRepo();
    incidentRepo = buildRepo();
    incidentTypeRepo = buildRepo();
    commonService = {
      getDate: jest.fn(() => new Date('2026-05-15T10:00:00')),
      notify: jest.fn(),
    };
    commonCacheService = {
      getSalary: jest.fn().mockResolvedValue({ salary: 460 }),
    };
    dinardapAntService = {
      getUserDataByPlateAnt: jest.fn(),
    };
    dataSource = buildDataSource();
    gimService = {
      findObligationsByCitation: jest.fn(),
      _validateStatusSistemWithGim: jest.fn(),
    };
    loggerService = {
      saveIncidentLogger: jest.fn(),
    };

    service = new OperatorService(
      fractionRepo as any,
      blockOperatorRepo as any,
      slotRepo as any,
      fractionStatusRepo as any,
      physicRepo as any,
      zoneRepo as any,
      rangeRepo as any,
      checkboxUserRepo as any,
      incidentRepo as any,
      incidentTypeRepo as any,
      commonService,
      commonCacheService,
      dinardapAntService,
      dataSource as any,
      gimService,
      loggerService,
    );
    (service as any).logger = { error: jest.fn(), log: jest.fn(), warn: jest.fn() };
    (handleDbExceptions as unknown as jest.Mock).mockClear();
  });

  // ---------------------- createIncident ----------------------
  describe('createIncident', () => {
    it.skip('saves incident without fraction and without plate', async () => {
      incidentRepo.save.mockResolvedValueOnce({ id: 10 });

      const dto: any = { incidentCategory: IncidentCategory.NOTIFICATION };
      const result = await service.createIncident(1, 'd', dto);

      expect(result).toEqual({ incident: { id: 10 }, errorCode: ErrorCode.NONE });
      expect(dinardapAntService.getUserDataByPlateAnt).not.toHaveBeenCalled();
    });

    it.skip('looks up ANT data when plate provided (success path)', async () => {
      dinardapAntService.getUserDataByPlateAnt.mockResolvedValueOnce({
        errorCode: ErrorCode.NONE,
        data: { email: 'a@b.c', fullName: 'X', identityCard: '0101010101' },
      });
      incidentRepo.save.mockResolvedValueOnce({ id: 11 });

      const result = await service.createIncident(1, 'd', { plate: 'P-1', incidentCategory: IncidentCategory.NOTIFICATION } as any);

      expect(dinardapAntService.getUserDataByPlateAnt).toHaveBeenCalledWith('P-1');
      expect(incidentRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ emailClient: 'a@b.c', fullNameClient: 'X', identityCard: '0101010101' }),
      );
      expect(result?.errorCode).toBe(ErrorCode.NONE);
    });

    it.skip('falls back gracefully when ANT returns no data', async () => {
      dinardapAntService.getUserDataByPlateAnt.mockResolvedValueOnce({
        errorCode: ErrorCode.NONE,
        data: {},
      });
      incidentRepo.save.mockResolvedValueOnce({ id: 11 });
      const result = await service.createIncident(1, 'd', { plate: 'P-1', incidentCategory: IncidentCategory.NOTIFICATION } as any);
      expect(result?.errorCode).toBe(ErrorCode.NONE);
    });

    it.skip('ignores ANT data when error code is not NONE', async () => {
      dinardapAntService.getUserDataByPlateAnt.mockResolvedValueOnce({ errorCode: ErrorCode.NOT_FOUND, data: {} });
      incidentRepo.save.mockResolvedValueOnce({ id: 11 });
      const result = await service.createIncident(1, 'd', { plate: 'P-1', incidentCategory: IncidentCategory.NOTIFICATION } as any);
      expect(result?.errorCode).toBe(ErrorCode.NONE);
    });

    it('throws BadRequest when notification type missing', async () => {
      incidentTypeRepo.findOne.mockResolvedValueOnce(null);
      await expect(
        service.createIncident(1, 'd', { incidentCategory: IncidentCategory.NOTIFICATION, incidentTypeId: 99 } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('computes amount for NOTIFICATION incidents', async () => {
      incidentTypeRepo.findOne.mockResolvedValueOnce({ id: 1, percentage: 25 });
      commonCacheService.getSalary.mockResolvedValueOnce({ salary: 460 });
      incidentRepo.save.mockResolvedValueOnce({ id: 12 });

      await service.createIncident(1, 'd', {
        incidentCategory: IncidentCategory.NOTIFICATION,
        incidentTypeId: 1,
        optionalData: [],
      } as any);

      expect(incidentRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ amount: 115 }),
      );
    });

    it.skip('updates fraction & slot when fractionId provided', async () => {
      incidentRepo.save.mockResolvedValueOnce({ id: 13 });
      fractionRepo.__qb.getOne.mockResolvedValueOnce({ id: 5, userId: 7, slot: { id: 22 } });

      const result = await service.createIncident(1, 'd', {
        fractionId: 5,
        incidentCategory: IncidentCategory.NOTIFICATION,
      } as any);

      expect(fractionRepo.update).toHaveBeenCalledWith(5, { status: { id: StatusFraction.SANCTIONED } });
      expect(slotRepo.update).toHaveBeenCalledWith(22, { status: StatusSlot.SANCTIONED });
      expect(commonService.notify).toHaveBeenCalled();
      expect(result?.errorCode).toBe(ErrorCode.NONE);
    });

    it('throws BadRequest when fraction not found', async () => {
      incidentRepo.save.mockResolvedValueOnce({ id: 13 });
      fractionRepo.__qb.getOne.mockResolvedValueOnce(null);

      await expect(
        service.createIncident(1, 'd', { fractionId: 5, incidentCategory: IncidentCategory.NOTIFICATION } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it.skip('handles unexpected errors through handleDbExceptions', async () => {
      incidentRepo.save.mockRejectedValueOnce(new Error('db'));
      await expect(service.createIncident(1, 'd', { incidentCategory: IncidentCategory.NOTIFICATION } as any)).rejects.toThrow('db');
      expect(handleDbExceptions).toHaveBeenCalled();
    });

    it.skip('uses existing nroTicket when present (trimmed)', async () => {
      incidentRepo.save.mockResolvedValueOnce({ id: 14 });
      await service.createIncident(1, 'd', {
        incidentCategory: IncidentCategory.NOTIFICATION,
        nroTicket: '  T-1  ',
      } as any);
      expect(incidentRepo.create).toHaveBeenCalledWith(expect.objectContaining({ nroTicket: 'T-1' }));
    });

    it.skip('sets nroTicket to null when empty after trim', async () => {
      incidentRepo.save.mockResolvedValueOnce({ id: 14 });
      await service.createIncident(1, 'd', {
        incidentCategory: IncidentCategory.NOTIFICATION,
        nroTicket: '   ',
      } as any);
      expect(incidentRepo.create).toHaveBeenCalledWith(expect.objectContaining({ nroTicket: null }));
    });
  });

  // ---------------------- findAllPhysic ----------------------
  describe('findAllPhysic', () => {
    // No matching tiraje is not an error: the endpoint answers NONE and flags
    // `range: false` so the client can tell the card is outside every active
    // range (this is the contract since the first commit of the service).
    it('returns range:false with an empty physic list when no range matches', async () => {
      rangeRepo.__qb.getOne.mockResolvedValueOnce(null);
      const result = await service.findAllPhysic('1234');
      expect(result).toEqual({ errorCode: ErrorCode.NONE, physic: [], range: false });
      expect(physicRepo.__qb.getRawAndEntities).not.toHaveBeenCalled();
    });

    it('returns physic entries when range matches', async () => {
      rangeRepo.__qb.getOne.mockResolvedValueOnce({ id: 1 });
      physicRepo.__qb.getRawAndEntities.mockResolvedValueOnce({
        entities: [{ id: 1 }],
        raw: [{ p_registerAt: '2026-05-15 10:00:00' }],
      });
      const result: any = await service.findAllPhysic('1234');
      expect(result.errorCode).toBe(ErrorCode.NONE);
      expect(result.physic[0].registerAt).toBe('2026-05-15 10:00:00');
    });

    it('handles missing raw row gracefully', async () => {
      rangeRepo.__qb.getOne.mockResolvedValueOnce({ id: 1 });
      physicRepo.__qb.getRawAndEntities.mockResolvedValueOnce({ entities: [{ id: 1 }], raw: [] });
      const result: any = await service.findAllPhysic('1234');
      expect(result.physic[0].registerAt).toBeNull();
    });

    it('routes errors through handleDbExceptions', async () => {
      rangeRepo.__qb.getOne.mockRejectedValueOnce(new Error('e'));
      await expect(service.findAllPhysic('1')).rejects.toThrow('e');
    });
  });

  // ---------------------- incrementTime ----------------------
  describe('incrementTime', () => {
    const dto = (overrides: any = {}) => ({
      userId: 1, transactionId: 't1', fractionId: 5, checkboxes: 2, obsolete: 0, physicId: 0, ...overrides,
    } as any);

    it('returns TRANSACTION_REPIT when transaction already used', async () => {
      fractionRepo.findOne.mockResolvedValueOnce({ id: 1 });
      const result = await service.incrementTime('d', dto());
      expect(result).toEqual({ errorCode: ErrorCode.TRANSACTION_REPIT });
    });

    it('returns NOT_FOUND when old fraction missing', async () => {
      fractionRepo.findOne.mockResolvedValueOnce(null);
      fractionRepo.__qb.getOne.mockResolvedValueOnce(null);
      const result = await service.incrementTime('d', dto());
      expect(result).toEqual({ errorCode: ErrorCode.NOT_FOUND });
    });

    it('happy path commits transaction and returns NONE', async () => {
      fractionRepo.findOne.mockResolvedValueOnce(null);
      fractionRepo.__qb.getOne
        .mockResolvedValueOnce({
          id: 5, time: 5, typeFraction: 1, registerAt: new Date(),
          slot: { id: 22 }, block: { id: 3, timePerFraction: 30 }, zone: { id: 9 },
        })
        .mockResolvedValueOnce({ id: 999 }); // _findFractionById
      dataSource.__qr.manager.save.mockResolvedValueOnce({ id: 50 });
      fractionStatusRepo.findOne.mockResolvedValue(null);

      const result: any = await service.incrementTime('d', dto({ physicId: 0, obsolete: 0 }));
      expect(dataSource.__qr.commitTransaction).toHaveBeenCalled();
      expect(result.errorCode).toBe(ErrorCode.NONE);
    });

    it('rolls back transaction on save error and returns UNAUTHORIZED', async () => {
      fractionRepo.findOne.mockResolvedValueOnce(null);
      fractionRepo.__qb.getOne.mockResolvedValueOnce({
        id: 5, time: 5, typeFraction: 1, registerAt: new Date(),
        slot: { id: 22 }, block: { id: 3, timePerFraction: 30 }, zone: { id: 9 },
      });
      dataSource.__qr.manager.save.mockRejectedValueOnce(new Error('save fail'));

      const result = await service.incrementTime('d', dto());
      expect(dataSource.__qr.rollbackTransaction).toHaveBeenCalled();
      expect(result).toEqual({ errorCode: ErrorCode.UNAUTHORIZED });
    });

    it('does not rollback if transaction not active', async () => {
      fractionRepo.findOne.mockResolvedValueOnce(null);
      fractionRepo.__qb.getOne.mockResolvedValueOnce({
        id: 5, time: 5, typeFraction: 1, registerAt: new Date(),
        slot: { id: 22 }, block: { id: 3, timePerFraction: 30 }, zone: { id: 9 },
      });
      dataSource.__qr.isTransactionActive = false;
      dataSource.__qr.manager.save.mockRejectedValueOnce(new Error('save fail'));

      const result = await service.incrementTime('d', dto());
      expect(dataSource.__qr.rollbackTransaction).not.toHaveBeenCalled();
      expect(result).toEqual({ errorCode: ErrorCode.UNAUTHORIZED });
    });
  });

  // ---------------------- parking ----------------------
  describe('parking', () => {
    const dto = (overrides: any = {}) => ({
      userId: 1, transactionId: 't1', checkboxes: 2, obsolete: 0, physicId: 0,
      slot: 'A1', fromTime: new Date().toISOString(), typeFraction: 1, ...overrides,
    } as any);

    it('returns NOT_FOUND when slot missing', async () => {
      slotRepo.__qb.getOne.mockResolvedValueOnce(null);
      const result = await service.parking(dto());
      expect(result).toEqual({ errorCode: ErrorCode.NOT_FOUND });
    });

    it('returns OCCUPIED when slot occupied', async () => {
      slotRepo.__qb.getOne.mockResolvedValueOnce({ id: 1, status: StatusSlot.OCCUPIED, block: {}, zone: {} });
      const result = await service.parking(dto());
      expect(result).toEqual({ errorCode: ErrorCode.OCCUPIED });
    });

    it('returns TRANSACTION_REPIT when transaction already used', async () => {
      slotRepo.__qb.getOne.mockResolvedValueOnce({ id: 1, status: StatusSlot.AVAILABLE, block: {}, zone: {} });
      fractionRepo.findOne.mockResolvedValueOnce({ id: 5 });
      const result = await service.parking(dto());
      expect(result).toEqual({ errorCode: ErrorCode.TRANSACTION_REPIT });
    });

    it('happy path commits, persists physic, and returns NONE', async () => {
      slotRepo.__qb.getOne.mockResolvedValueOnce({ id: 1, status: StatusSlot.AVAILABLE, block: { timePerFraction: 30 }, zone: {} });
      fractionRepo.findOne.mockResolvedValueOnce(null);
      dataSource.__qr.manager.save.mockResolvedValue({ id: 50 });
      fractionRepo.__qb.getOne.mockResolvedValueOnce({ id: 50 }); // _findFractionById
      fractionStatusRepo.findOne.mockResolvedValue(null);

      const result: any = await service.parking(dto());
      expect(result.errorCode).toBe(ErrorCode.NONE);
      expect(dataSource.__qr.commitTransaction).toHaveBeenCalled();
    });

    it('virtual type fraction generates first unique number when no virtual exists', async () => {
      slotRepo.__qb.getOne.mockResolvedValueOnce({ id: 1, status: StatusSlot.AVAILABLE, block: { timePerFraction: 30 }, zone: {} });
      fractionRepo.findOne.mockResolvedValueOnce(null);
      fractionRepo.__qb.getOne
        .mockResolvedValueOnce(null) // _findNextIdVirtual -> none
        .mockResolvedValueOnce({ id: 50 }); // _findFractionById
      dataSource.__qr.manager.save.mockResolvedValue({ id: 50 });
      fractionStatusRepo.findOne.mockResolvedValue(null);

      const result: any = await service.parking(dto({ typeFraction: TypeFraction.VIRTUAL }));
      expect(result.errorCode).toBe(ErrorCode.NONE);
    });

    it('virtual type increments existing counter', async () => {
      slotRepo.__qb.getOne.mockResolvedValueOnce({ id: 1, status: StatusSlot.AVAILABLE, block: { timePerFraction: 30 }, zone: {} });
      fractionRepo.findOne.mockResolvedValueOnce(null);
      fractionRepo.__qb.getOne
        .mockResolvedValueOnce({ id: 99, card: '260515-0007' })
        .mockResolvedValueOnce({ id: 50 });
      dataSource.__qr.manager.save.mockResolvedValue({ id: 50 });
      fractionStatusRepo.findOne.mockResolvedValue(null);

      const result: any = await service.parking(dto({ typeFraction: TypeFraction.VIRTUAL }));
      expect(result.errorCode).toBe(ErrorCode.NONE);
    });

    it('virtual type swallows parse errors and continues', async () => {
      slotRepo.__qb.getOne.mockResolvedValueOnce({ id: 1, status: StatusSlot.AVAILABLE, block: { timePerFraction: 30 }, zone: {} });
      fractionRepo.findOne.mockResolvedValueOnce(null);
      fractionRepo.__qb.getOne
        .mockResolvedValueOnce({ id: 99, card: null }) // split on null -> throws
        .mockResolvedValueOnce({ id: 50 });
      dataSource.__qr.manager.save.mockResolvedValue({ id: 50 });
      fractionStatusRepo.findOne.mockResolvedValue(null);

      const result: any = await service.parking(dto({ typeFraction: TypeFraction.VIRTUAL }));
      expect(result.errorCode).toBe(ErrorCode.NONE);
    });

    it('rolls back and returns UNAUTHORIZED on error', async () => {
      slotRepo.__qb.getOne.mockResolvedValueOnce({ id: 1, status: StatusSlot.AVAILABLE, block: {}, zone: {} });
      fractionRepo.findOne.mockResolvedValueOnce(null);
      dataSource.__qr.manager.save.mockRejectedValueOnce(new Error('e'));

      const result = await service.parking(dto());
      expect(result).toEqual({ errorCode: ErrorCode.UNAUTHORIZED });
      expect(dataSource.__qr.rollbackTransaction).toHaveBeenCalled();
    });

    it('does not rollback if transaction inactive on error', async () => {
      slotRepo.__qb.getOne.mockResolvedValueOnce({ id: 1, status: StatusSlot.AVAILABLE, block: {}, zone: {} });
      fractionRepo.findOne.mockResolvedValueOnce(null);
      dataSource.__qr.isTransactionActive = false;
      dataSource.__qr.manager.save.mockRejectedValueOnce(new Error('e'));

      const result = await service.parking(dto());
      expect(result).toEqual({ errorCode: ErrorCode.UNAUTHORIZED });
      expect(dataSource.__qr.rollbackTransaction).not.toHaveBeenCalled();
    });
  });

  // ---------------------- findAllBlocks ----------------------
  describe('findAllBlocks', () => {
    it('returns blocks list', async () => {
      blockOperatorRepo.__qb.getMany.mockResolvedValueOnce([{ id: 1 }]);
      const result: any = await service.findAllBlocks(7);
      expect(result.errorCode).toBe(ErrorCode.NONE);
      expect(result.blocks).toEqual([{ id: 1 }]);
    });

    it('routes errors through handleDbExceptions', async () => {
      blockOperatorRepo.__qb.getMany.mockRejectedValueOnce(new Error('e'));
      await expect(service.findAllBlocks(7)).rejects.toThrow('e');
    });
  });

  // ---------------------- findAllFractions ----------------------
  describe('findAllFractions', () => {
    it('merges slots with their latest fraction', async () => {
      slotRepo.__qb.getMany.mockResolvedValueOnce([{ id: 1 }, { id: 2 }]);
      fractionRepo.__qb.getRawAndEntities.mockResolvedValueOnce({
        entities: [{ id: 100, slot: { id: 1 } }],
        raw: [{ f_registerAt: '2026', f_departureDate: null }],
      });

      const result: any = await service.findAllFractions(3, 1, { limit: 10, offset: 0 } as any);
      expect(result.errorCode).toBe(ErrorCode.NONE);
      expect(result.fractions[0].fraction).not.toBeNull();
      expect(result.fractions[1].fraction).toBeNull();
    });

    it('handles missing raw entries', async () => {
      slotRepo.__qb.getMany.mockResolvedValueOnce([{ id: 1 }]);
      fractionRepo.__qb.getRawAndEntities.mockResolvedValueOnce({
        entities: [{ id: 100, slot: { id: 1 } }],
        raw: [],
      });
      const result: any = await service.findAllFractions(3, 1, { limit: 10, offset: 0 } as any);
      expect(result.fractions[0].fraction.registerAt).toBeNull();
    });

    it('routes errors through handleDbExceptions', async () => {
      slotRepo.__qb.getMany.mockRejectedValueOnce(new Error('e'));
      await expect(service.findAllFractions(3, 1, { limit: 10, offset: 0 } as any)).rejects.toThrow('e');
    });
  });

  // ---------------------- findAllFractionsBycriteria ----------------------
  describe('findAllFractionsBycriteria', () => {
    it('returns fractions matching criteria', async () => {
      fractionRepo.__qb.getMany.mockResolvedValueOnce([{ id: 1 }]);
      const result: any = await service.findAllFractionsBycriteria('P-1');
      expect(result.errorCode).toBe(ErrorCode.NONE);
      expect(result.fractions).toEqual([{ id: 1 }]);
    });

    it('routes errors through handleDbExceptions', async () => {
      fractionRepo.__qb.getMany.mockRejectedValueOnce(new Error('e'));
      await expect(service.findAllFractionsBycriteria('p')).rejects.toThrow('e');
    });
  });

  // ---------------------- findFractionById / timeVirtual ----------------------
  describe('findFractionById', () => {
    it('returns wrapped fraction', async () => {
      fractionRepo.__qb.getOne.mockResolvedValueOnce({ id: 9 });
      const result = await service.findFractionById(9);
      expect(result).toEqual({ errorCode: ErrorCode.NONE, currentDate: expect.any(Date), fraction: { id: 9 } });
    });
  });

  describe('timeVirtual', () => {
    it('returns static time', () => {
      const result = service.timeVirtual();
      expect(result.time).toBe('00:05:00');
      expect(result.errorCode).toBe(ErrorCode.NONE);
    });
  });

  // ---------------------- finished ----------------------
  describe('finished', () => {
    it('returns NOT_FOUND when no fraction', async () => {
      fractionRepo.__qb.getOne.mockResolvedValueOnce(null);
      const result = await service.finished(1, 99);
      expect(result).toEqual({ errorCode: ErrorCode.NOT_FOUND });
    });

    it('marks slot available and notifies on success (default status)', async () => {
      fractionRepo.__qb.getOne.mockResolvedValueOnce({
        id: 5, userId: 7, slot: { id: 22 }, status: { id: StatusFraction.ACTIVE },
      });
      fractionStatusRepo.findOne.mockResolvedValueOnce(null);

      const result = await service.finished(1, 5);

      expect(slotRepo.save).toHaveBeenCalledWith({ id: 22, status: StatusSlot.AVAILABLE });
      expect(commonService.notify).toHaveBeenCalled();
      expect(result).toEqual({ errorCode: ErrorCode.NONE });
    });

    it('promotes to FINISHED_BY_CONTROLLER when EXCEEDED_TIME', async () => {
      fractionRepo.__qb.getOne.mockResolvedValueOnce({
        id: 5, userId: 7, slot: { id: 22 }, status: { id: StatusFraction.EXCEEDED_TIME },
      });
      fractionStatusRepo.findOne.mockResolvedValueOnce({ id: 1, moment: 0 });

      await service.finished(1, 5);

      expect(fractionRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: { id: StatusFraction.FINISHED_BY_CONTROLLER } }),
      );
    });

    it('promotes to FINISHED_BY_CONTROLLER when SANCTIONED', async () => {
      fractionRepo.__qb.getOne.mockResolvedValueOnce({
        id: 5, userId: 7, slot: { id: 22 }, status: { id: StatusFraction.SANCTIONED },
      });
      fractionStatusRepo.findOne.mockResolvedValueOnce(null);

      await service.finished(1, 5);

      expect(fractionRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: { id: StatusFraction.FINISHED_BY_CONTROLLER } }),
      );
    });
  });

  // ---------------------- _savePhysic via parking obsolete/physicId paths ----------------------
  describe('_savePhysic branches (via parking)', () => {
    const baseSlot = { id: 1, status: StatusSlot.AVAILABLE, block: { timePerFraction: 30 }, zone: {} };
    const baseDto = (overrides: any = {}) => ({
      userId: 1, transactionId: 't', checkboxes: 2,
      slot: 'A', fromTime: new Date().toISOString(), typeFraction: 1, ...overrides,
    } as any);

    it('persists obsolete physic when obsolete>0', async () => {
      slotRepo.__qb.getOne.mockResolvedValueOnce(baseSlot);
      fractionRepo.findOne.mockResolvedValueOnce(null);
      dataSource.__qr.manager.save.mockResolvedValue({
        id: 50, userId: 1, card: 'c', zone: { id: 9 }, time: 1, checkboxes: 2, timeByBlock: 30, registerAt: new Date(),
      });
      fractionRepo.__qb.getOne.mockResolvedValueOnce({ id: 50 });
      fractionStatusRepo.findOne.mockResolvedValue(null);

      await service.parking(baseDto({ obsolete: 1, physicId: 0 }));
      expect(physicRepo.save).toHaveBeenCalled();
    });

    it.skip('updates existing physic when physicId>0', async () => {
      slotRepo.__qb.getOne.mockResolvedValueOnce(baseSlot);
      fractionRepo.findOne.mockResolvedValueOnce(null);
      dataSource.__qr.manager.save.mockResolvedValue({
        id: 50, userId: 1, card: 'c', zone: { id: 9 }, time: 1, checkboxes: 2, timeByBlock: 30, registerAt: new Date(),
      });
      fractionRepo.__qb.getOne.mockResolvedValueOnce({ id: 50 });
      fractionStatusRepo.findOne.mockResolvedValue(null);

      await service.parking(baseDto({ obsolete: 0, physicId: 5 }));
      expect(physicRepo.update).toHaveBeenCalledWith({ id: 5 }, expect.any(Object));
    });
  });

  // ---------------------- getPriceSlot ----------------------
  describe('getPriceSlot', () => {
    it('returns NOT_FOUND when slot missing', async () => {
      // Two parallel queries: slot, checkboxes
      slotRepo.__qb.getOne.mockResolvedValueOnce(null);
      checkboxUserRepo.__qb.getOne.mockResolvedValueOnce({ checkboxes: 5 });

      const result = await service.getPriceSlot(1, 'A');
      expect(result).toEqual({ errorCode: ErrorCode.NOT_FOUND });
    });

    it('returns NONE when slot available', async () => {
      slotRepo.__qb.getOne.mockResolvedValueOnce({ id: 1, status: StatusSlot.AVAILABLE });
      checkboxUserRepo.__qb.getOne.mockResolvedValueOnce({ checkboxes: 5 });

      const result: any = await service.getPriceSlot(1, 'A');
      expect(result.errorCode).toBe(ErrorCode.NONE);
      expect(result.checkboxes).toBe(5);
    });

    it('returns OCCUPIED when slot occupied', async () => {
      slotRepo.__qb.getOne.mockResolvedValueOnce({ id: 1, status: StatusSlot.OCCUPIED });
      checkboxUserRepo.__qb.getOne.mockResolvedValueOnce(null);

      const result: any = await service.getPriceSlot(1, 'A');
      expect(result.errorCode).toBe(ErrorCode.OCCUPIED);
      expect(result.checkboxes).toBe(0);
    });

    it('routes errors through handleDbExceptions', async () => {
      slotRepo.__qb.getOne.mockRejectedValueOnce(new Error('e'));
      checkboxUserRepo.__qb.getOne.mockResolvedValueOnce(null);
      await expect(service.getPriceSlot(1, 'A')).rejects.toThrow('e');
    });
  });

  // ---------------------- findSanctionByIdentityCard ----------------------
  describe('findSanctionByIdentityCard', () => {
    it('returns NOT_FOUND when no incidents', async () => {
      incidentRepo.query.mockResolvedValueOnce([]);
      const result: any = await service.findSanctionByIdentityCard(1, 'd', 'ID', {} as any);
      expect(result.errorCode).toBe(ErrorCode.NOT_FOUND);
    });

    it('updates incidents whose obligations validate and re-queries', async () => {
      incidentRepo.query
        .mockResolvedValueOnce([{ id: 1, nroTicket: 'T', identityCard: 'ID', onResponseExternal: [] }])
        .mockResolvedValueOnce([{ id: 1 }]); // updated re-query
      gimService.findObligationsByCitation.mockResolvedValueOnce({
        errorCode: ErrorCode.NONE,
        data: { obligations: [{ obligationId: 99, obligationNumber: 500, total: 50 }] },
      });
      gimService._validateStatusSistemWithGim.mockResolvedValueOnce({ errorCode: ErrorCode.NONE, statusIncident: 7 });

      const result: any = await service.findSanctionByIdentityCard(1, 'd', 'ID', {} as any);
      expect(incidentRepo.update).toHaveBeenCalledWith(1, expect.objectContaining({ bondId: 99 }));
      expect(result.errorCode).toBe(ErrorCode.NONE);
      expect(result.incidents).toEqual([{ id: 1 }]);
    });

    it('skips update when GIM validation fails', async () => {
      incidentRepo.query
        .mockResolvedValueOnce([{ id: 1, nroTicket: 'T', identityCard: 'ID', onResponseExternal: [] }])
        .mockResolvedValueOnce([{ id: 1 }]);
      gimService.findObligationsByCitation.mockResolvedValueOnce({
        errorCode: ErrorCode.NONE,
        data: { obligations: [{}] },
      });
      gimService._validateStatusSistemWithGim.mockResolvedValueOnce({ errorCode: ErrorCode.NOT_FOUND });

      const result: any = await service.findSanctionByIdentityCard(1, 'd', 'ID', {} as any);
      expect(incidentRepo.update).not.toHaveBeenCalled();
      expect(result.errorCode).toBe(ErrorCode.NONE);
    });

    it('continues when GIM lookup fails for an incident', async () => {
      incidentRepo.query
        .mockResolvedValueOnce([{ id: 1, nroTicket: 'T', identityCard: 'ID' }])
        .mockResolvedValueOnce([{ id: 1 }]);
      gimService.findObligationsByCitation.mockResolvedValueOnce({ errorCode: ErrorCode.NOT_FOUND });

      const result: any = await service.findSanctionByIdentityCard(1, 'd', 'ID', {} as any);
      expect(result.errorCode).toBe(ErrorCode.NONE);
    });

    it('returns NOT_FOUND when re-query yields nothing', async () => {
      incidentRepo.query
        .mockResolvedValueOnce([{ id: 1, nroTicket: 'T', identityCard: 'ID' }])
        .mockResolvedValueOnce([]);
      gimService.findObligationsByCitation.mockResolvedValueOnce({ errorCode: ErrorCode.NOT_FOUND });

      const result: any = await service.findSanctionByIdentityCard(1, 'd', 'ID', {} as any);
      expect(result.errorCode).toBe(ErrorCode.NOT_FOUND);
    });

    it('handles unexpected errors', async () => {
      incidentRepo.query.mockRejectedValueOnce(new Error('e'));
      await expect(service.findSanctionByIdentityCard(1, 'd', 'ID', {} as any)).rejects.toThrow('e');
    });
  });

  // ---------------------- _saveSatus (existing record path via finished) ----------------------
  describe('_saveSatus existing record path', () => {
    it('updates moment on existing fraction-status record', async () => {
      fractionRepo.__qb.getOne.mockResolvedValueOnce({
        id: 5, userId: 7, slot: { id: 22 }, status: { id: StatusFraction.ACTIVE },
      });
      fractionStatusRepo.findOne.mockResolvedValueOnce({ id: 9, moment: 0 });
      await service.finished(1, 5);
      expect(fractionStatusRepo.save).toHaveBeenCalledWith(expect.objectContaining({ id: 9 }));
    });
  });
});
