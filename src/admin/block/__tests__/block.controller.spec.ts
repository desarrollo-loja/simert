import { ForbiddenException } from '@nestjs/common';

import { BlockController } from '../block.controller';
import { BlockService } from '../block.service';

const buildServiceMock = () => ({
  initializeDatabase: jest.fn(),
  create: jest.fn(),
  findAll: jest.fn(),
  findAllByfilter: jest.fn(),
  findAllByFilterParking: jest.fn(),
  findOne: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
  getAllBlockSector: jest.fn(),
  createBlockSector: jest.fn(),
  updateBlockSector: jest.fn(),
});

describe('BlockController', () => {
  let controller: BlockController;
  let service: ReturnType<typeof buildServiceMock>;
  const fakeResult = { ok: true } as any;

  beforeEach(() => {
    service = buildServiceMock();
    controller = new BlockController(service as unknown as BlockService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('initializeDatabase', () => {
    it('delegates to service.initializeDatabase', () => {
      service.initializeDatabase.mockReturnValue(fakeResult);
      expect(controller.initializeDatabase()).toBe(fakeResult);
    });
  });

  describe('create', () => {
    it('delegates to service.create with userId and dto', () => {
      service.create.mockReturnValue(fakeResult);
      const user: any = { id: 1, idDevice: 'dev' };
      const dto: any = { name: 'X' };
      expect(controller.create(user, 1, 'dev', dto)).toBe(fakeResult);
      expect(service.create).toHaveBeenCalledWith(1, dto);
    });
  });

  describe('findAll', () => {
    it('delegates to service.findAll with filter', () => {
      service.findAll.mockReturnValue(fakeResult);
      const filter: any = { search: 'q' };
      const user: any = { id: 1 };
      expect(controller.findAll(user, filter, 1, 'dev')).toBe(fakeResult);
      expect(service.findAll).toHaveBeenCalledWith(filter);
    });
  });

  describe('findAllByfilter', () => {
    it('delegates with zoneId', () => {
      service.findAllByfilter.mockReturnValue(fakeResult);
      expect(controller.findAllByfilter(5)).toBe(fakeResult);
      expect(service.findAllByfilter).toHaveBeenCalledWith(5);
    });
  });

  describe('findAllByFilterParking', () => {
    it('delegates with version and filter', () => {
      service.findAllByFilterParking.mockReturnValue(fakeResult);
      const filter: any = {};
      expect(controller.findAllByFilterParking(1, filter)).toBe(fakeResult);
      expect(service.findAllByFilterParking).toHaveBeenCalledWith(1, filter);
    });
  });

  describe('findOne', () => {
    it('parses id and delegates', () => {
      service.findOne.mockReturnValue(fakeResult);
      expect(controller.findOne('7')).toBe(fakeResult);
      expect(service.findOne).toHaveBeenCalledWith(7);
    });
  });

  describe('update', () => {
    it('forbids when user.id mismatches param userId', () => {
      const user: any = { id: 99, idDevice: 'dev' };
      expect(() => controller.update(user, 1, 'dev', '5', {} as any)).toThrow(
        ForbiddenException,
      );
    });

    it('forbids when user.idDevice mismatches', () => {
      const user: any = { id: 1, idDevice: 'other' };
      expect(() => controller.update(user, 1, 'dev', '5', {} as any)).toThrow(
        ForbiddenException,
      );
    });

    it('delegates to service.update when authorized', () => {
      service.update.mockReturnValue(fakeResult);
      const user: any = { id: 1, idDevice: 'dev' };
      const dto: any = { name: 'X' };
      expect(controller.update(user, 1, 'dev', '5', dto)).toBe(fakeResult);
      expect(service.update).toHaveBeenCalledWith(1, 5, dto);
    });
  });

  describe('remove', () => {
    it('parses id and delegates', () => {
      service.remove.mockReturnValue(fakeResult);
      expect(controller.remove('3')).toBe(fakeResult);
      expect(service.remove).toHaveBeenCalledWith(3);
    });
  });

  describe('getAllBlockSector', () => {
    it('delegates with filter', () => {
      service.getAllBlockSector.mockReturnValue(fakeResult);
      const user: any = { id: 1 };
      const filter: any = { search: 'a' };
      expect(controller.getAllBlockSector(user, 1, 'dev', 1, filter)).toBe(fakeResult);
      expect(service.getAllBlockSector).toHaveBeenCalledWith(filter);
    });
  });

  describe('createBlockSector', () => {
    it('delegates to service.createBlockSector', () => {
      service.createBlockSector.mockReturnValue(fakeResult);
      const user: any = { id: 1 };
      const dto: any = { name: 'X' };
      expect(controller.createBlockSector(user, 1, 'dev', 1, dto)).toBe(fakeResult);
      expect(service.createBlockSector).toHaveBeenCalledWith(1, dto);
    });
  });

  describe('updateBlockSector', () => {
    it('forbids when userId mismatches', () => {
      const user: any = { id: 99, idDevice: 'dev' };
      expect(() =>
        controller.updateBlockSector(user, 1, 'dev', 1, '5', {} as any),
      ).toThrow(ForbiddenException);
    });

    it('forbids when idDevice mismatches', () => {
      const user: any = { id: 1, idDevice: 'other' };
      expect(() =>
        controller.updateBlockSector(user, 1, 'dev', 1, '5', {} as any),
      ).toThrow(ForbiddenException);
    });

    it('delegates when authorized', () => {
      service.updateBlockSector.mockReturnValue(fakeResult);
      const user: any = { id: 1, idDevice: 'dev' };
      const dto: any = { name: 'X' };
      expect(controller.updateBlockSector(user, 1, 'dev', 1, '5', dto)).toBe(fakeResult);
      expect(service.updateBlockSector).toHaveBeenCalledWith(1, 5, dto);
    });
  });
});
