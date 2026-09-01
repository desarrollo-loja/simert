import { ErrorCode } from 'src/common/glob/error';
import { IncidentStatus } from 'src/common/glob/type/type_incident';

import { IncidentService } from '../incident.service';

describe('IncidentService (root worker)', () => {
  let service: IncidentService;
  let repo: any;
  let gim: any;
  let common: any;

  beforeEach(() => {
    repo = { find: jest.fn(), save: jest.fn() };
    gim = { validateOpenTill: jest.fn(), registerDeposit: jest.fn() };
    common = { syncOnResponseExternal: jest.fn() };
    service = new IncidentService(repo, gim, common);
    (service as any).logger = {
      verbose: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      log: jest.fn(),
    };
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('is defined', () => {
    expect(service).toBeDefined();
  });

  it('schedules the deposit-validation interval on module init', async () => {
    const spy = jest.spyOn(global, 'setInterval');
    await service.onModuleInit();
    expect(spy).toHaveBeenCalled();
  });

  // ─── _validateIncidentEmitAndPay: sync of the GIM response chain ───────────
  describe('_validateIncidentEmitAndPay', () => {
    const buildIncident = () => ({
      id: 4,
      bondId: 88,
      amount: '12.00',
      identityCard: '1104567890',
      transactionId: 'tx-9',
      statusIncident: IncidentStatus.SUPPLIED,
      onResponseExternal: [{ bondId: 88, bondNumber: 777 }],
    });

    beforeEach(() => {
      gim.validateOpenTill.mockResolvedValue({ errorCode: ErrorCode.NONE });
      repo.save.mockImplementation((incident: any) => Promise.resolve(incident));
      common.syncOnResponseExternal.mockResolvedValue({});
    });

    it('mirrors the rejection to the transaction when the deposit fails', async () => {
      const incident = buildIncident();
      repo.find.mockResolvedValue([incident]);
      gim.registerDeposit.mockResolvedValue({
        errorCode: ErrorCode.NOT_FOUND,
        data: { ok: false, message: 'La obligación ya se encuentra pagada' },
      });

      await (service as any)._validateIncidentEmitAndPay();

      expect(incident.statusIncident).toBe(IncidentStatus.SUPPLIED);
      expect(common.syncOnResponseExternal).toHaveBeenCalledWith(
        'tx-9',
        incident.onResponseExternal,
      );
    });

    it('mirrors the chain when the deposit succeeds', async () => {
      const incident = buildIncident();
      repo.find.mockResolvedValue([incident]);
      gim.registerDeposit.mockResolvedValue({
        errorCode: ErrorCode.NONE,
        data: { ok: true, reference: 'ref-9', total: 12 },
      });

      await (service as any)._validateIncidentEmitAndPay();

      expect(incident.statusIncident).toBe(IncidentStatus.PAYED);
      expect(common.syncOnResponseExternal).toHaveBeenCalledWith(
        'tx-9',
        incident.onResponseExternal,
      );
    });

    it('skips the mirroring when GIM answered without a body', async () => {
      const incident = buildIncident();
      repo.find.mockResolvedValue([incident]);
      gim.registerDeposit.mockResolvedValue({
        errorCode: ErrorCode.NOT_FOUND,
        data: null,
      });

      await (service as any)._validateIncidentEmitAndPay();

      // Nothing was appended, so the transaction already holds this exact chain.
      expect(common.syncOnResponseExternal).not.toHaveBeenCalled();
    });

    it('reads the backlog oldest-first, with the id breaking ties', async () => {
      // Same FIFO contract as the checkbox job: the first fine that arrived is
      // the first one deposited, and the autoincremental id decides between two
      // fines sharing a `register` timestamp.
      repo.find.mockResolvedValue([]);

      await (service as any)._validateIncidentEmitAndPay();

      expect(repo.find).toHaveBeenCalledWith(
        expect.objectContaining({ order: { register: 'ASC', id: 'ASC' } }),
      );
    });

    it('aborts without reading incidents when the till is closed', async () => {
      gim.validateOpenTill.mockResolvedValue({
        errorCode: ErrorCode.NOT_FOUND,
        message: 'caja cerrada',
      });

      await (service as any)._validateIncidentEmitAndPay();

      expect(repo.find).not.toHaveBeenCalled();
      expect(common.syncOnResponseExternal).not.toHaveBeenCalled();
    });
  });
});
