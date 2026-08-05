import { ErrorCode } from 'src/common/glob/error';
import { IncidentStatus } from 'src/common/glob/type/type_incident';

import { CheckService } from '../check.service';

describe('CheckService', () => {
  let service: CheckService;

  beforeEach(() => {
    service = new CheckService(
      { query: jest.fn() } as any,
      {} as any,
      {} as any,
      { query: jest.fn() } as any,
      {} as any,
      {} as any,
      {} as any,
      {} as any,
      { get: jest.fn(), set: jest.fn() } as any,
    );
    (service as any).logger = { verbose: jest.fn(), error: jest.fn(), warn: jest.fn(), log: jest.fn() };
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('is defined', () => {
    expect(service).toBeDefined();
  });

  it('schedules the background intervals on module init', async () => {
    const spy = jest.spyOn(global, 'setInterval');
    await service.onModuleInit();
    expect(spy).toHaveBeenCalled();
  });

  // ─── _validateCheckboxToEmitAndPay: sync of the GIM response chain ────────
  describe('_validateCheckboxToEmitAndPay', () => {
    /**
     * Wires the collaborators the job touches and returns them so each test can
     * assert on the mirroring call. `checkbox` is the single pending row the job
     * processes.
     */
    const arrange = (checkbox: any) => {
      const checkboxRepository = {
        find: jest.fn().mockResolvedValue([checkbox]),
        save: jest.fn().mockResolvedValue(checkbox),
      };
      const commonService = { syncOnResponseExternal: jest.fn().mockResolvedValue({}) };
      const gimService = {
        validateOpenTill: jest.fn().mockResolvedValue({ errorCode: ErrorCode.NONE }),
        registerDeposit: jest.fn(),
        getUserByIdentityCardGim: jest.fn().mockResolvedValue({ errorCode: ErrorCode.NOT_FOUND }),
        createNewNaturalPersonGim: jest.fn().mockResolvedValue({ errorCode: ErrorCode.NOT_FOUND }),
      };
      const commonAuthService = {
        findUserByIdAndApplication: jest.fn().mockResolvedValue({ errorCode: ErrorCode.NOT_FOUND }),
      };

      Object.assign(service as any, {
        checkboxRepository,
        commonService,
        gimService,
        commonAuthService,
      });

      return { checkboxRepository, commonService, gimService };
    };

    const buildCheckbox = (statusIncident: IncidentStatus | null) => ({
      id: 7,
      userId: 3,
      amount: '1.50',
      identityCard: '1104567890',
      transactionId: 'tx-1',
      statusIncident,
      // The bondId proves the credit title was already issued in GIM.
      onResponseExternal: [{ bondId: 10, bondNumber: 555 }],
    });

    it('mirrors the chain to the transaction when the deposit fails on an issued checkbox', async () => {
      const checkbox = buildCheckbox(IncidentStatus.SUPPLIED);
      const { commonService, gimService } = arrange(checkbox);
      gimService.registerDeposit.mockResolvedValue({
        errorCode: ErrorCode.NOT_FOUND,
        data: { ok: false, message: 'La obligación ya se encuentra pagada' },
      });

      await (service as any)._validateCheckboxToEmitAndPay();

      // The emission stays visible in Recaudaciones even though the cycle did
      // not reach PAYED.
      expect(checkbox.statusIncident).toBe(IncidentStatus.SUPPLIED);
      expect(commonService.syncOnResponseExternal).toHaveBeenCalledWith(
        'tx-1',
        checkbox.onResponseExternal,
      );
      expect(checkbox.onResponseExternal).toEqual(
        expect.arrayContaining([expect.objectContaining({ bondId: 10 })]),
      );
    });

    it('mirrors the chain when the deposit succeeds', async () => {
      const checkbox = buildCheckbox(IncidentStatus.SUPPLIED);
      const { commonService, gimService } = arrange(checkbox);
      gimService.registerDeposit.mockResolvedValue({
        errorCode: ErrorCode.NONE,
        data: { ok: true, reference: 'ref-1', total: 1.5 },
      });

      await (service as any)._validateCheckboxToEmitAndPay();

      expect(checkbox.statusIncident).toBe(IncidentStatus.PAYED);
      expect(commonService.syncOnResponseExternal).toHaveBeenCalledWith(
        'tx-1',
        checkbox.onResponseExternal,
      );
    });

    it('does not mirror anything when the issuance itself fails', async () => {
      const checkbox = buildCheckbox(null);
      checkbox.onResponseExternal = [];
      const { commonService, gimService } = arrange(checkbox);

      await (service as any)._validateCheckboxToEmitAndPay();

      // No residentId could be resolved, so nothing was issued: there is no
      // bondId to show and the deposit is never attempted.
      expect(gimService.registerDeposit).not.toHaveBeenCalled();
      expect(commonService.syncOnResponseExternal).not.toHaveBeenCalled();
    });

    it('aborts without touching GIM when the till is closed', async () => {
      const checkbox = buildCheckbox(IncidentStatus.SUPPLIED);
      const { commonService, gimService, checkboxRepository } = arrange(checkbox);
      gimService.validateOpenTill.mockResolvedValue({
        errorCode: ErrorCode.NOT_FOUND,
        message: 'caja cerrada',
      });

      await (service as any)._validateCheckboxToEmitAndPay();

      expect(checkboxRepository.find).not.toHaveBeenCalled();
      expect(commonService.syncOnResponseExternal).not.toHaveBeenCalled();
    });
  });
});
