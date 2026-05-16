import { AdminController } from '../admin.controller';
import { AdminService } from '../admin.service';
import { CreateAdminDto } from '../dto/create-admin.dto';

// Direct instantiation avoids pulling the Nest DI graph (guards/JwtService).
const buildServiceMock = () => ({
  findAllSlots: jest.fn(),
  delete: jest.fn(),
  create: jest.fn(),
});

describe('AdminController (client)', () => {
  let controller: AdminController;
  let service: ReturnType<typeof buildServiceMock>;
  const fakeResult = { ok: true } as any;

  beforeEach(() => {
    service = buildServiceMock();
    controller = new AdminController(service as unknown as AdminService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('findAllBlocks', () => {
    it('delegates to service.findAllSlots with latitude and longitude', () => {
      service.findAllSlots.mockReturnValue(fakeResult);

      const result = controller.findAllBlocks(-3.99, -79.2, 'device-uuid', 1);

      expect(service.findAllSlots).toHaveBeenCalledWith(-3.99, -79.2);
      expect(result).toBe(fakeResult);
    });
  });

  describe('delete', () => {
    it('delegates to service.delete with the slotId', () => {
      service.delete.mockReturnValue(fakeResult);

      const result = controller.delete(1, 'device-uuid', 7, 1);

      expect(service.delete).toHaveBeenCalledWith(7);
      expect(result).toBe(fakeResult);
    });
  });

  describe('create', () => {
    it('delegates to service.create with the dto', () => {
      service.create.mockReturnValue(fakeResult);
      const dto = { slot: 'A1' } as CreateAdminDto;

      const result = controller.create(1, 'device-uuid', dto);

      expect(service.create).toHaveBeenCalledWith(dto);
      expect(result).toBe(fakeResult);
    });
  });
});
