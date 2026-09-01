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
      const pending = Array.isArray(checkbox) ? checkbox : [checkbox];
      const checkboxRepository = {
        find: jest.fn().mockResolvedValue(pending),
        save: jest.fn().mockResolvedValue(pending[0]),
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

    // ─── Agrupamiento por contribuyente + transacción ───────────────────────
    describe('agrupamiento antes de depositar', () => {
      /**
       * Builds an already-issued checkbox, so the job only has to deposit it.
       *
       * @param over Fields overriding the defaults (id, transactionId, amount…).
       * @returns The checkbox row.
       */
      const issued = (over: Record<string, any>) => ({
        id: 1,
        userId: 3,
        amount: '1.50',
        identityCard: '1104567890',
        transactionId: 'tx-1',
        statusIncident: IncidentStatus.SUPPLIED,
        onResponseExternal: [{ bondId: 10, bondNumber: 555 }],
        ...over,
      });

      it('deposits the whole group of one taxpayer in a single GIM call', async () => {
        // Three cards bought in one transaction used to produce three separate
        // deposits for the same charge.
        const group = [
          issued({ id: 1, onResponseExternal: [{ bondId: 10 }] }),
          issued({ id: 2, onResponseExternal: [{ bondId: 11 }] }),
          issued({ id: 3, onResponseExternal: [{ bondId: 12 }] }),
        ];
        const { gimService } = arrange(group);
        gimService.registerDeposit.mockResolvedValue({ errorCode: ErrorCode.NONE, data: { ok: true } });

        await (service as any)._validateCheckboxToEmitAndPay();

        expect(gimService.registerDeposit).toHaveBeenCalledTimes(1);
        expect(gimService.registerDeposit).toHaveBeenCalledWith(
          expect.objectContaining({
            bondIds: [10, 11, 12],
            // 1.50 * 3, summed in cents so the total carries no float drift.
            amount: '4.50',
            identificationNumber: '1104567890',
            transactionId: 'tx-1',
          }),
        );
        // Every member of the group closes its cycle.
        expect(group.map((checkbox) => checkbox.statusIncident)).toEqual([
          IncidentStatus.PAYED,
          IncidentStatus.PAYED,
          IncidentStatus.PAYED,
        ]);
      });

      it('keeps one deposit per transaction, even for the same taxpayer', async () => {
        // GIM's contract carries a single transactionId per deposit, so two
        // transactions can never be settled together.
        const { gimService } = arrange([
          issued({ id: 1, transactionId: 'tx-1', onResponseExternal: [{ bondId: 10 }] }),
          issued({ id: 2, transactionId: 'tx-2', onResponseExternal: [{ bondId: 11 }] }),
        ]);
        gimService.registerDeposit.mockResolvedValue({ errorCode: ErrorCode.NONE, data: { ok: true } });

        await (service as any)._validateCheckboxToEmitAndPay();

        expect(gimService.registerDeposit).toHaveBeenCalledTimes(2);
        expect(gimService.registerDeposit.mock.calls.map((call) => call[0].transactionId)).toEqual([
          'tx-1',
          'tx-2',
        ]);
      });

      it('sends the groups starting from the one whose oldest charge arrived first', async () => {
        // The repository already answers ordered by register/id, so the group of
        // the first charge to arrive must be deposited first.
        const { gimService } = arrange([
          issued({ id: 1, transactionId: 'tx-early', onResponseExternal: [{ bondId: 10 }] }),
          issued({ id: 2, transactionId: 'tx-late', onResponseExternal: [{ bondId: 11 }] }),
          issued({ id: 3, transactionId: 'tx-early', onResponseExternal: [{ bondId: 12 }] }),
        ]);
        gimService.registerDeposit.mockResolvedValue({ errorCode: ErrorCode.NONE, data: { ok: true } });

        await (service as any)._validateCheckboxToEmitAndPay();

        expect(gimService.registerDeposit.mock.calls.map((call) => call[0].transactionId)).toEqual([
          'tx-early',
          'tx-late',
        ]);
        // The late charge of tx-early rides in its group's single deposit.
        expect(gimService.registerDeposit.mock.calls[0][0].bondIds).toEqual([10, 12]);
      });

      it('leaves out of the deposit the charge whose credit title was never issued', async () => {
        // A card with no bondId was not deposited, so it must not reach PAYED
        // on the back of the rest of the group.
        const withoutBond = issued({ id: 2, onResponseExternal: [] });
        const { gimService } = arrange([
          issued({ id: 1, onResponseExternal: [{ bondId: 10 }] }),
          withoutBond,
        ]);
        gimService.registerDeposit.mockResolvedValue({ errorCode: ErrorCode.NONE, data: { ok: true } });

        await (service as any)._validateCheckboxToEmitAndPay();

        expect(gimService.registerDeposit).toHaveBeenCalledTimes(1);
        expect(gimService.registerDeposit.mock.calls[0][0].bondIds).toEqual([10]);
        expect(withoutBond.statusIncident).toBe(IncidentStatus.SUPPLIED);
      });
    });

    it('reads the backlog oldest-first, with the id breaking ties', async () => {
      // The queue must always start from the first charge that arrived. `register`
      // is set by the application, so two charges can share it; without the
      // autoincremental id as a tiebreaker their relative order is undefined and
      // a later charge could overtake an earlier one.
      const checkbox = buildCheckbox(IncidentStatus.SUPPLIED);
      const { checkboxRepository } = arrange(checkbox);

      await (service as any)._validateCheckboxToEmitAndPay();

      expect(checkboxRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({ order: { register: 'ASC', id: 'ASC' } }),
      );
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
