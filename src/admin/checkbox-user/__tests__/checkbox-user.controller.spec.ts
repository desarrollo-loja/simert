import { CheckboxUserController } from '../checkbox-user.controller';
import { CheckboxUserService } from '../checkbox-user.service';
import { CreateCheckboxUserDto } from '../dto/create-checkbox-user.dto';
import { UpdateCheckboxUserDto } from '../dto/update-checkbox-user.dto';

// Direct instantiation avoids pulling the Nest DI graph.
const buildServiceMock = () => ({
  create: jest.fn(),
  findAll: jest.fn(),
  findOne: jest.fn(),
  update: jest.fn(),
  remove: jest.fn(),
});

describe('CheckboxUserController', () => {
  let controller: CheckboxUserController;
  let service: ReturnType<typeof buildServiceMock>;

  const fake = { ok: true } as any;

  beforeEach(() => {
    service = buildServiceMock();
    controller = new CheckboxUserController(service as unknown as CheckboxUserService);
  });

  it('is defined', () => {
    expect(controller).toBeDefined();
  });

  it('create delegates to service.create', () => {
    service.create.mockReturnValue(fake);
    const dto = {} as CreateCheckboxUserDto;
    expect(controller.create(dto)).toBe(fake);
    expect(service.create).toHaveBeenCalledWith(dto);
  });

  it('findAll delegates to service.findAll', () => {
    service.findAll.mockReturnValue(fake);
    expect(controller.findAll()).toBe(fake);
  });

  it('findOne parses id to number and delegates', () => {
    service.findOne.mockReturnValue(fake);
    expect(controller.findOne('5')).toBe(fake);
    expect(service.findOne).toHaveBeenCalledWith(5);
  });

  it('update parses id to number and delegates', () => {
    service.update.mockReturnValue(fake);
    const dto = {} as UpdateCheckboxUserDto;
    expect(controller.update('7', dto)).toBe(fake);
    expect(service.update).toHaveBeenCalledWith(7, dto);
  });

  it('remove parses id to number and delegates', () => {
    service.remove.mockReturnValue(fake);
    expect(controller.remove('9')).toBe(fake);
    expect(service.remove).toHaveBeenCalledWith(9);
  });
});
