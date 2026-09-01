import { ErrorCode } from 'src/common/glob/error';
import { IncidentStatus } from 'src/common/glob/type/type_incident';

import { IncidentService } from '../incident.service';

/**
 * Drains the microtask queue so a cycle whose collaborators are immediate mocks
 * advances up to its first genuinely pending promise.
 *
 * @returns A promise resolved once the queue is drained.
 */
const flushMicrotasks = async () => {
  for (let i = 0; i < 50; i++) await Promise.resolve();
};

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

    it('leaves out of the deposit the fine whose credit title was never issued', async () => {
      // `bondId` is nullable, and it used to be mapped straight into `bondIds`,
      // so a fine with no issued title sent `[88, null]` to the municipality.
      // It must also not reach PAYED on the back of the rest of the group.
      const withBond = buildIncident();
      const withoutBond = { ...buildIncident(), id: 5, bondId: null };
      repo.find.mockResolvedValue([withBond, withoutBond]);
      gim.registerDeposit.mockResolvedValue({
        errorCode: ErrorCode.NONE,
        data: { ok: true },
      });

      await (service as any)._validateIncidentEmitAndPay();

      expect(gim.registerDeposit).toHaveBeenCalledTimes(1);
      expect(gim.registerDeposit.mock.calls[0][0].bondIds).toEqual([88]);
      // The amount covers only what is actually being settled.
      expect(gim.registerDeposit.mock.calls[0][0].amount).toBe('12.00');
      expect(withBond.statusIncident).toBe(IncidentStatus.PAYED);
      expect(withoutBond.statusIncident).toBe(IncidentStatus.SUPPLIED);
    });

    it('does not call GIM at all when no fine of the group has a title', async () => {
      repo.find.mockResolvedValue([{ ...buildIncident(), bondId: null }]);

      await (service as any)._validateIncidentEmitAndPay();

      expect(gim.registerDeposit).not.toHaveBeenCalled();
    });

    it('never doubles a slow cycle, so no deposit is registered twice', async () => {
      // `setInterval` does not wait for the previous callback. Without the guard
      // two cycles read the same backlog — the first has not saved anything yet
      // — and registered two GIM deposits for the same bondIds.
      const incident = buildIncident();
      let releaseDeposit: () => void = () => undefined;
      repo.find.mockResolvedValue([incident]);
      gim.registerDeposit.mockImplementation(
        () =>
          new Promise((resolve) => {
            releaseDeposit = () =>
              resolve({ errorCode: ErrorCode.NONE, data: { ok: true } });
          }),
      );

      const firstCycle = (service as any)._validateIncidentEmitAndPay();
      // Let the first cycle run until it is parked on the GIM call.
      await flushMicrotasks();
      expect(gim.registerDeposit).toHaveBeenCalledTimes(1);

      // Second tick while the first cycle is still waiting on GIM: it must be
      // skipped, not run a deposit of its own.
      await (service as any)._validateIncidentEmitAndPay();
      expect(gim.registerDeposit).toHaveBeenCalledTimes(1);

      releaseDeposit();
      await firstCycle;

      // Once the cycle finished, the next tick is allowed through again: the
      // guard must not latch and stop the queue for good.
      repo.find.mockResolvedValue([buildIncident()]);
      gim.registerDeposit.mockResolvedValue({
        errorCode: ErrorCode.NONE,
        data: { ok: true },
      });

      await (service as any)._validateIncidentEmitAndPay();
      expect(gim.registerDeposit).toHaveBeenCalledTimes(2);
    });

    it('releases the guard when the cycle throws, so the queue keeps retrying', async () => {
      // A cycle that dies must not leave the flag set: every pending fine has to
      // keep being attempted on the following ticks.
      repo.find.mockRejectedValueOnce(new Error('db caída'));

      await (service as any)._validateIncidentEmitAndPay();

      repo.find.mockResolvedValue([buildIncident()]);
      gim.registerDeposit.mockResolvedValue({ errorCode: ErrorCode.NONE, data: { ok: true } });

      await (service as any)._validateIncidentEmitAndPay();

      expect(gim.registerDeposit).toHaveBeenCalledTimes(1);
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
