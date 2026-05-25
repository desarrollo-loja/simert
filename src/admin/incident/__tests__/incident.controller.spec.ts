import { BadRequestException } from '@nestjs/common';

import { CreateIncidentDto } from '../dto/create-incident.dto';
import { IncidentDto } from '../dto/incident.dto';
import { IncidentFilterDto } from '../dto/incident-filterdto.dto';
import { UpdateIncidentDto } from '../dto/update-incident.dto';
import { IncidentController } from '../incident.controller';
import { IncidentService } from '../incident.service';

// Builds a fresh mock IncidentService for every test, with all service methods
// stubbed. The controller is a thin layer that delegates to the service, so
// directly instantiating the controller with this mock avoids pulling in the
// Nest DI graph (guards, JwtService, etc).
const buildServiceMock = () => ({
  create: jest.fn(),
  findAll: jest.fn(),
  findAllTotal: jest.fn(),
  findAllByTransactionId: jest.fn(),
  findAllClient: jest.fn(),
  findOne: jest.fn(),
  update: jest.fn(),
  updateStatusGim: jest.fn(),
  uploadToAlfresco: jest.fn(),
  getFileUrlAlfresco: jest.fn(),
  getAlfrescoIdBySharedUrl: jest.fn(),
  remove: jest.fn(),
  findStatistics: jest.fn(),
  findAllFractionSanction: jest.fn(),
  findStatisticsByFraction: jest.fn(),
  findAllFractionSanctionTotal: jest.fn(),
  findAllTotalVehicleClientTime: jest.fn(),
  findAllStatisticsFractionSanction: jest.fn(),
  findAndSincronizeToEmit: jest.fn(),
  findAllNotification: jest.fn(),
  advanceNextProcess: jest.fn(),
});

describe('IncidentController', () => {
  let controller: IncidentController;
  let service: ReturnType<typeof buildServiceMock>;

  const user: any = { id: 1, roles: ['ADMIN'] };
  const filterDto = { search: 'x' } as IncidentFilterDto;
  const fakeResult = { ok: true } as any;

  beforeEach(() => {
    service = buildServiceMock();
    controller = new IncidentController(service as unknown as IncidentService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('delegates to service.create with dto', async () => {
      service.create.mockResolvedValue(fakeResult);
      const dto = { plate: 'ABC-123' } as CreateIncidentDto;

      const result = await controller.create(dto);

      expect(service.create).toHaveBeenCalledWith(dto);
      expect(result).toBe(fakeResult);
    });
  });

  describe('findAll', () => {
    it('passes filter to service.findAll', async () => {
      service.findAll.mockResolvedValue(fakeResult);

      const result = await controller.findAll(1, 'dev-uuid', filterDto);

      expect(service.findAll).toHaveBeenCalledWith(filterDto);
      expect(result).toBe(fakeResult);
    });
  });

  describe('findAllTotal', () => {
    it('delegates to service.findAllTotal', async () => {
      service.findAllTotal.mockResolvedValue(fakeResult);

      const result = await controller.findAllTotal(1, 'dev-uuid', filterDto);

      expect(service.findAllTotal).toHaveBeenCalledWith(filterDto);
      expect(result).toBe(fakeResult);
    });
  });

  describe('findAllByTransactionId', () => {
    it('delegates to service.findAllByTransactionId with the filter', async () => {
      service.findAllByTransactionId.mockResolvedValue(fakeResult);

      const result = await controller.findAllByTransactionId(user, filterDto);

      expect(service.findAllByTransactionId).toHaveBeenCalledWith(filterDto);
      expect(result).toBe(fakeResult);
    });
  });

  describe('findAllClient', () => {
    it('delegates to service.findAllClient with the filter', async () => {
      service.findAllClient.mockResolvedValue(fakeResult);

      const result = await controller.findAllClient(filterDto, 1, 'dev', 1);

      expect(service.findAllClient).toHaveBeenCalledWith(filterDto);
      expect(result).toBe(fakeResult);
    });
  });

  describe('findOne', () => {
    it('parses id to number and delegates to service.findOne', async () => {
      service.findOne.mockResolvedValue(fakeResult);

      const result = await controller.findOne('42');

      expect(service.findOne).toHaveBeenCalledWith(42);
      expect(result).toBe(fakeResult);
    });
  });

  describe('update', () => {
    it('delegates to service.update with parsed id and flag', async () => {
      service.update.mockResolvedValue(fakeResult);
      const dto = { description: 'desc' } as UpdateIncidentDto;

      const result = await controller.update(1, 'dev', '10', 1, dto);

      expect(service.update).toHaveBeenCalledWith(10, dto, 1, 1);
      expect(result).toBe(fakeResult);
    });
  });

  describe('updateStatusGim', () => {
    it('delegates to service.updateStatusGim', async () => {
      service.updateStatusGim.mockResolvedValue(fakeResult);
      const dto = { statusIncident: 2 } as unknown as UpdateIncidentDto;

      const result = await controller.updateStatusGim(1, 'dev', '7', dto);

      expect(service.updateStatusGim).toHaveBeenCalledWith(7, dto, 1);
      expect(result).toBe(fakeResult);
    });
  });

  describe('uploadAlfresco', () => {
    it('throws BadRequestException when no file is provided', () => {
      expect(() => controller.uploadAlfresco(1, 'dev', undefined)).toThrow(
        BadRequestException,
      );
      expect(service.uploadToAlfresco).not.toHaveBeenCalled();
    });

    it('forwards buffer and originalname to service.uploadToAlfresco', async () => {
      service.uploadToAlfresco.mockResolvedValue(fakeResult);
      const file = { buffer: Buffer.from('x'), originalname: 'f.pdf' };

      const result = await controller.uploadAlfresco(1, 'dev', file as any);

      expect(service.uploadToAlfresco).toHaveBeenCalledWith(file.buffer, 'f.pdf');
      expect(result).toBe(fakeResult);
    });
  });

  describe('getFileUrlAlfresco', () => {
    it('throws BadRequestException when alfrescoId is empty', () => {
      expect(() => controller.getFileUrlAlfresco(1, 'dev', '')).toThrow(
        BadRequestException,
      );
      expect(service.getFileUrlAlfresco).not.toHaveBeenCalled();
    });

    it('delegates to service when alfrescoId is provided', async () => {
      service.getFileUrlAlfresco.mockResolvedValue(fakeResult);

      const result = await controller.getFileUrlAlfresco(1, 'dev', 'node-id');

      expect(service.getFileUrlAlfresco).toHaveBeenCalledWith('node-id');
      expect(result).toBe(fakeResult);
    });
  });

  describe('getAlfrescoIdBySharedUrl', () => {
    it('throws BadRequestException when sharedUrl is empty', () => {
      expect(() => controller.getAlfrescoIdBySharedUrl(1, 'dev', '')).toThrow(
        BadRequestException,
      );
      expect(service.getAlfrescoIdBySharedUrl).not.toHaveBeenCalled();
    });

    it('delegates to service when sharedUrl is provided', async () => {
      service.getAlfrescoIdBySharedUrl.mockResolvedValue(fakeResult);

      const sharedUrl =
        'http://181.113.129.20/alf/alfresco/api/-default-/public/alfresco/versions/1/shared-links/abc/content';
      const result = await controller.getAlfrescoIdBySharedUrl(1, 'dev', sharedUrl);

      expect(service.getAlfrescoIdBySharedUrl).toHaveBeenCalledWith(sharedUrl);
      expect(result).toBe(fakeResult);
    });
  });

  describe('remove', () => {
    it('delegates to service.remove with parsed id', async () => {
      service.remove.mockResolvedValue(fakeResult);

      const result = await controller.remove(user, 1, 'dev', '99');

      expect(service.remove).toHaveBeenCalledWith(99);
      expect(result).toBe(fakeResult);
    });
  });

  describe('statistics endpoints', () => {
    const baseFilter = {} as any;

    it('findStatistics delegates to service', async () => {
      service.findStatistics.mockResolvedValue(fakeResult);
      const result = await controller.findStatistics(baseFilter, 1, 'dev', 1);
      expect(service.findStatistics).toHaveBeenCalledWith(baseFilter);
      expect(result).toBe(fakeResult);
    });

    it('findAllFractionSanction delegates to service', async () => {
      service.findAllFractionSanction.mockResolvedValue(fakeResult);
      const result = await controller.findAllFractionSanction(baseFilter, 1, 'dev', 1);
      expect(service.findAllFractionSanction).toHaveBeenCalledWith(baseFilter);
      expect(result).toBe(fakeResult);
    });

    it('findStatisticsByFraction delegates to service', async () => {
      service.findStatisticsByFraction.mockResolvedValue(fakeResult);
      const result = await controller.findStatisticsByFraction(baseFilter, 1, 'dev', 1);
      expect(service.findStatisticsByFraction).toHaveBeenCalledWith(baseFilter);
      expect(result).toBe(fakeResult);
    });

    it('findAllFractionSanctionTotal delegates to service', async () => {
      service.findAllFractionSanctionTotal.mockResolvedValue(fakeResult);
      const result = await controller.findAllFractionSanctionTotal(baseFilter, 1, 'dev', 1);
      expect(service.findAllFractionSanctionTotal).toHaveBeenCalledWith(baseFilter);
      expect(result).toBe(fakeResult);
    });

    it('findAllTotalVehicleClientTime delegates to service', async () => {
      service.findAllTotalVehicleClientTime.mockResolvedValue(fakeResult);
      const result = await controller.findAllTotalVehicleClientTime(baseFilter, 1, 'dev', 1);
      expect(service.findAllTotalVehicleClientTime).toHaveBeenCalledWith(baseFilter);
      expect(result).toBe(fakeResult);
    });

    it('findAllStatisticsFractionSanction delegates to service', async () => {
      service.findAllStatisticsFractionSanction.mockResolvedValue(fakeResult);
      const result = await controller.findAllStatisticsFractionSanction(baseFilter, 1, 'dev', 1);
      expect(service.findAllStatisticsFractionSanction).toHaveBeenCalledWith(baseFilter);
      expect(result).toBe(fakeResult);
    });
  });

  describe('findAndSincronizeToEmit', () => {
    it('forwards all parameters to service', async () => {
      service.findAndSincronizeToEmit.mockResolvedValue(fakeResult);

      const result = await controller.findAndSincronizeToEmit(
        user,
        1,
        'dev',
        1,
        2,
        filterDto,
      );

      expect(service.findAndSincronizeToEmit).toHaveBeenCalledWith(1, 'dev', filterDto, 1);
      expect(result).toBe(fakeResult);
    });
  });

  describe('findAllNotification', () => {
    it('delegates to service.findAllNotification', async () => {
      service.findAllNotification.mockResolvedValue(fakeResult);

      const result = await controller.findAllNotification(1, 'dev', 1, filterDto);

      expect(service.findAllNotification).toHaveBeenCalledWith(filterDto);
      expect(result).toBe(fakeResult);
    });
  });

  describe('advanceNextProcess', () => {
    it('forwards all parameters to service', async () => {
      service.advanceNextProcess.mockResolvedValue(fakeResult);
      const incidentDto = { id: 7 } as IncidentDto;

      const result = await controller.advanceNextProcess(user, 1, 'dev', 1, 2, incidentDto);

      expect(service.advanceNextProcess).toHaveBeenCalledWith(1, 'dev', incidentDto, 1);
      expect(result).toBe(fakeResult);
    });
  });
});
