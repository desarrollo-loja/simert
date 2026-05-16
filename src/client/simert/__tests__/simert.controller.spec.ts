import { SimertController } from '../simert.controller';

describe('SimertController', () => {
  let controller: SimertController;
  let service: any;

  beforeEach(() => {
    service = {
      findAllFractions: jest.fn().mockResolvedValue('findAllFractions'),
      findFractionById: jest.fn().mockResolvedValue('findFractionById'),
      parking: jest.fn().mockResolvedValue('parking'),
      incrementTime: jest.fn().mockResolvedValue('incrementTime'),
      finished: jest.fn().mockResolvedValue('finished'),
      getPriceSlot: jest.fn().mockResolvedValue('getPriceSlot'),
      findFractionHistory: jest.fn().mockResolvedValue('findFractionHistory'),
    };
    controller = new SimertController(service);
  });

  it('findAllFractions -> delegates to service', async () => {
    const res = await controller.findAllFractions({} as any, 1, 'dev', 1);
    expect(service.findAllFractions).toHaveBeenCalledWith(1);
    expect(res).toBe('findAllFractions');
  });

  it('findFractionById -> delegates to service', async () => {
    const res = await controller.findFractionById({} as any, 1, 'dev', 9, 1);
    expect(service.findFractionById).toHaveBeenCalledWith(9);
    expect(res).toBe('findFractionById');
  });

  it('parking -> injects meta and delegates', async () => {
    const dto: any = {};
    const meta: any = { ip: '1.2.3.4' };
    const res = await controller.parking({} as any, meta, 1, 'dev', 1, dto);
    expect(dto.meta).toBe(meta);
    expect(service.parking).toHaveBeenCalledWith('dev', dto);
    expect(res).toBe('parking');
  });

  it('incrementTime -> injects meta and delegates', async () => {
    const dto: any = {};
    const meta: any = { ip: '5.6.7.8' };
    const res = await controller.incrementTime({} as any, meta, 1, 'dev', 1, dto);
    expect(dto.meta).toBe(meta);
    expect(service.incrementTime).toHaveBeenCalledWith('dev', dto);
    expect(res).toBe('incrementTime');
  });

  it('finished -> delegates to service', async () => {
    const res = await controller.finished({} as any, 1, 'dev', 99, 1);
    expect(service.finished).toHaveBeenCalledWith(1, 99);
    expect(res).toBe('finished');
  });

  it('getPriceSlot -> delegates to service', async () => {
    const res = await controller.getPriceSlot({} as any, 1, 'dev', 'A01', 1);
    expect(service.getPriceSlot).toHaveBeenCalledWith(1, 'A01');
    expect(res).toBe('getPriceSlot');
  });

  it('findFractionHistory -> delegates to service', async () => {
    const dto: any = { year: 2026, month: 5 };
    const res = await controller.findFractionHistory({} as any, 1, 'dev', 1, dto);
    expect(service.findFractionHistory).toHaveBeenCalledWith(1, dto);
    expect(res).toBe('findFractionHistory');
  });
});
