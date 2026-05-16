import { FilterDto } from 'src/common/dto/filter.dto';

import { CardController } from '../card.controller';
import { CardService } from '../card.service';
import { CreateCardDto } from '../dto/create-card.dto';
import { UpdateCardDto } from '../dto/update-card.dto';

const buildServiceMock = () => ({
  create: jest.fn(),
  findAll: jest.fn(),
  findAllTotal: jest.fn(),
  update: jest.fn(),
});

describe('CardController', () => {
  let controller: CardController;
  let service: ReturnType<typeof buildServiceMock>;
  const filter = {} as FilterDto;
  const fakeResult = { ok: true } as any;

  beforeEach(() => {
    service = buildServiceMock();
    controller = new CardController(service as unknown as CardService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('create delegates with userId and dto', async () => {
    service.create.mockResolvedValue(fakeResult);
    const dto = {} as CreateCardDto;
    const result = await controller.create(1, 'dev', 1, dto);
    expect(service.create).toHaveBeenCalledWith(1, dto);
    expect(result).toBe(fakeResult);
  });

  it('findAll delegates to service.findAll', async () => {
    service.findAll.mockResolvedValue(fakeResult);
    const result = await controller.findAll(1, 'dev', 1, filter);
    expect(service.findAll).toHaveBeenCalledWith(filter);
    expect(result).toBe(fakeResult);
  });

  it('findAllTotal delegates to service.findAllTotal', async () => {
    service.findAllTotal.mockResolvedValue(fakeResult);
    const result = await controller.findAllTotal(1, 'dev', 1, filter);
    expect(service.findAllTotal).toHaveBeenCalledWith(filter);
    expect(result).toBe(fakeResult);
  });

  it('update parses id and delegates to service.update', async () => {
    service.update.mockResolvedValue(fakeResult);
    const dto = {} as UpdateCardDto;
    const result = await controller.update('7', 1, 'dev', 1, dto);
    expect(service.update).toHaveBeenCalledWith(7, dto);
    expect(result).toBe(fakeResult);
  });
});
