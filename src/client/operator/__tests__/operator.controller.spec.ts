import { OperatorController } from '../operator.controller';
import { OperatorService } from '../operator.service';

const buildServiceMock = () => ({
  createIncident: jest.fn().mockResolvedValue({ ok: 'createIncident' }),
  finished: jest.fn().mockResolvedValue({ ok: 'finished' }),
  parking: jest.fn().mockResolvedValue({ ok: 'parking' }),
  incrementTime: jest.fn().mockResolvedValue({ ok: 'incrementTime' }),
  findAllBlocks: jest.fn().mockResolvedValue({ ok: 'findAllBlocks' }),
  findAllFractions: jest.fn().mockResolvedValue({ ok: 'findAllFractions' }),
  findFractionById: jest.fn().mockResolvedValue({ ok: 'findFractionById' }),
  findAllFractionsBycriteria: jest.fn().mockResolvedValue({ ok: 'criteria' }),
  timeVirtual: jest.fn().mockReturnValue({ ok: 'timeVirtual' }),
  findAllPhysic: jest.fn().mockResolvedValue({ ok: 'findAllPhysic' }),
  getPriceSlot: jest.fn().mockResolvedValue({ ok: 'getPriceSlot' }),
  findSanctionByIdentityCard: jest.fn().mockResolvedValue({ ok: 'findSanction' }),
});

describe('OperatorController', () => {
  let controller: OperatorController;
  let svc: ReturnType<typeof buildServiceMock>;

  beforeEach(() => {
    svc = buildServiceMock();
    controller = new OperatorController(svc as unknown as OperatorService);
  });

  it('createIncident delegates to service', async () => {
    const dto: any = { plate: 'P-1' };
    const result = await controller.createIncident(dto, 7, 'd-1');
    expect(svc.createIncident).toHaveBeenCalledWith(7, 'd-1', dto);
    expect(result).toEqual({ ok: 'createIncident' });
  });

  it('finished delegates to service', async () => {
    const result = await controller.finished({} as any, 1, 'd', 9, 1);
    expect(svc.finished).toHaveBeenCalledWith(1, 9);
    expect(result).toEqual({ ok: 'finished' });
  });

  it('register sets meta on dto and calls parking', async () => {
    const dto: any = {};
    const meta: any = { ip: '1.1.1.1' };
    const result = await controller.register({} as any, meta, 1, 'd', 1, dto);
    expect(dto.meta).toBe(meta);
    expect(svc.parking).toHaveBeenCalledWith(dto);
    expect(result).toEqual({ ok: 'parking' });
  });

  it('incrementTime sets meta on dto and calls service', async () => {
    const dto: any = {};
    const meta: any = { ip: '1.1.1.1' };
    const result = await controller.incrementTime({} as any, meta, 1, 'd', 1, dto);
    expect(dto.meta).toBe(meta);
    expect(svc.incrementTime).toHaveBeenCalledWith('d', dto);
    expect(result).toEqual({ ok: 'incrementTime' });
  });

  it('findAllBlocks delegates', async () => {
    const result = await controller.findAllBlocks({} as any, 'c', 5, 'd', 1);
    expect(svc.findAllBlocks).toHaveBeenCalledWith(5);
    expect(result).toEqual({ ok: 'findAllBlocks' });
  });

  it('findAllFractions delegates with pagination', async () => {
    const pagination: any = { limit: 10, offset: 0 };
    const result = await controller.findAllFractions(pagination, 1, 'd', 3, 1);
    expect(svc.findAllFractions).toHaveBeenCalledWith(3, 1, pagination);
    expect(result).toEqual({ ok: 'findAllFractions' });
  });

  it('findFractionById delegates', async () => {
    const result = await controller.findFractionById({} as any, {} as any, 1, 'd', 9, 1);
    expect(svc.findFractionById).toHaveBeenCalledWith(9);
    expect(result).toEqual({ ok: 'findFractionById' });
  });

  it('findAllFractionsByPlate delegates', async () => {
    const result = await controller.findAllFractionsByPlate({} as any, 'P-1', 1, 'd', 1);
    expect(svc.findAllFractionsBycriteria).toHaveBeenCalledWith('P-1');
    expect(result).toEqual({ ok: 'criteria' });
  });

  it('timeVirtual delegates', () => {
    const result = controller.timeVirtual({} as any, 'c', 1, 'd', 1);
    expect(svc.timeVirtual).toHaveBeenCalled();
    expect(result).toEqual({ ok: 'timeVirtual' });
  });

  it('findAllPhysic delegates', async () => {
    const result = await controller.findAllPhysic({} as any, '123', 1, 'd', 1);
    expect(svc.findAllPhysic).toHaveBeenCalledWith('123');
    expect(result).toEqual({ ok: 'findAllPhysic' });
  });

  it('getPriceSlot delegates', async () => {
    const result = await controller.getPriceSlot({} as any, 1, 'd', 'S-1', 1);
    expect(svc.getPriceSlot).toHaveBeenCalledWith(1, 'S-1');
    expect(result).toEqual({ ok: 'getPriceSlot' });
  });

  it('findSanctionByIdentityCard delegates', async () => {
    const dto: any = {};
    const result = await controller.findSanctionByIdentityCard({} as any, 1, 'd', 'ID', 1, dto);
    expect(svc.findSanctionByIdentityCard).toHaveBeenCalledWith(1, 'd', 'ID', dto);
    expect(result).toEqual({ ok: 'findSanction' });
  });
});
