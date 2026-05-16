import { CreateIncidentTypeDto } from '../dto/create-incident-type.dto';
import { IncidentTypeFilterDto } from '../dto/incident-type-filterdto.dto';
import { UpdateIncidentTypeDto } from '../dto/update-incident-type.dto';
import { IncidentTypeController } from '../incident-type.controller';
import { IncidentTypeService } from '../incident-type.service';

// Direct instantiation avoids pulling the Nest DI graph (guards/JwtService).
const buildServiceMock = () => ({
  create: jest.fn(),
  findAll: jest.fn(),
  getTypeIncidentById: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
});

describe('IncidentTypeController', () => {
  let controller: IncidentTypeController;
  let service: ReturnType<typeof buildServiceMock>;

  const user: any = { id: 1, roles: ['ADMIN'] };
  const fakeResult = { ok: true } as any;

  beforeEach(() => {
    service = buildServiceMock();
    controller = new IncidentTypeController(service as unknown as IncidentTypeService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('create', () => {
    it('delegates to service.create with userId and dto', async () => {
      service.create.mockResolvedValue(fakeResult);
      const dto = { name: 'X', code: 'C' } as CreateIncidentTypeDto;

      const result = await controller.create(1, 'dev', dto);

      expect(service.create).toHaveBeenCalledWith(1, dto);
      expect(result).toBe(fakeResult);
    });
  });

  describe('findAll', () => {
    it('delegates to service.findAll with filter only', async () => {
      service.findAll.mockResolvedValue(fakeResult);
      const filter = { search: 'q' } as IncidentTypeFilterDto;

      const result = await controller.findAll(1, 'dev', filter);

      expect(service.findAll).toHaveBeenCalledWith(filter);
      expect(result).toBe(fakeResult);
    });
  });

  describe('getTypeIncidentById', () => {
    it('delegates to service.getTypeIncidentById', async () => {
      service.getTypeIncidentById.mockResolvedValue(fakeResult);

      const result = await controller.getTypeIncidentById(1, 'dev', 5);

      expect(service.getTypeIncidentById).toHaveBeenCalledWith(5);
      expect(result).toBe(fakeResult);
    });
  });

  describe('update', () => {
    it('parses id and delegates to service.update', async () => {
      service.update.mockResolvedValue(fakeResult);
      const dto = { name: 'X' } as UpdateIncidentTypeDto;

      const result = await controller.update(1, 'dev', '7', dto);

      expect(service.update).toHaveBeenCalledWith(1, 7, dto);
      expect(result).toBe(fakeResult);
    });
  });

  describe('remove', () => {
    it('parses id and delegates to service.remove', async () => {
      service.remove.mockResolvedValue(fakeResult);

      const result = await controller.remove(user, 1, 'dev', '9');

      expect(service.remove).toHaveBeenCalledWith(9);
      expect(result).toBe(fakeResult);
    });
  });
});
