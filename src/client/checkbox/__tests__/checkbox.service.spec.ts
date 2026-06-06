/* eslint-disable @typescript-eslint/no-var-requires */
import { ErrorCode } from 'src/common/glob/error';
import { StatusMoment } from 'src/common/glob/status/status_moment';
import { StatusPayment } from 'src/common/glob/status/status_payment';
import { TypePaymentMethod } from 'src/common/glob/type/type_payment_method';

// Spy on handleDbExceptions so we can assert error routing without exercising
// the real Nest exception classes.
jest.mock('src/common/exceptions/error.db.exception', () => ({
  __esModule: true,
  default: jest.fn((error: any) => {
    throw error;
  }),
}));
import handleDbExceptions from 'src/common/exceptions/error.db.exception';

// uuidv4 is used inside _payPlaceToPay — stub to a stable value.
jest.mock('uuid', () => ({ v4: jest.fn(() => 'aaaa-bbbb-cccc-dddd') }));

import { CheckboxService } from '../checkbox.service';

const buildRepoMock = () => {
  const qb: any = {
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getOne: jest.fn(),
    getMany: jest.fn(),
  };
  return {
    create: jest.fn((dto: any) => ({ ...dto })),
    save: jest.fn(async (e: any) => e),
    findOne: jest.fn(),
    update: jest.fn(),
    query: jest.fn(),
    createQueryBuilder: jest.fn(() => qb),
    __qb: qb,
  };
};

const buildQueryRunner = () => ({
  connect: jest.fn(),
  startTransaction: jest.fn(),
  commitTransaction: jest.fn(),
  rollbackTransaction: jest.fn(),
  release: jest.fn(),
  isTransactionActive: true,
  manager: { save: jest.fn(async (e: any) => ({ id: 99, ...e })) },
});

describe('CheckboxService', () => {
  let service: CheckboxService;
  let checkboxRepo: ReturnType<typeof buildRepoMock>;
  let checkboxUserRepo: ReturnType<typeof buildRepoMock>;
  let cardRepo: ReturnType<typeof buildRepoMock>;
  let catalogRepo: ReturnType<typeof buildRepoMock>;
  let commonService: any;
  let commonAuthService: any;
  let commonGimService: any;
  let commonCheckboxService: any;
  let gimService: any;
  let dataSource: any;
  let queryRunner: any;

  beforeEach(() => {
    checkboxRepo = buildRepoMock();
    checkboxUserRepo = buildRepoMock();
    cardRepo = buildRepoMock();
    catalogRepo = buildRepoMock();
    queryRunner = buildQueryRunner();

    commonService = {
      checkDeUnaByIdentityCard: jest.fn(),
      checkPlaceToPayByIdentityCard: jest.fn(),
      getDate: jest.fn(() => '2025-01-01 10:00:00'),
      payDeUnaV2: jest.fn(),
      payAhorita: jest.fn(),
      payPlaceToPay: jest.fn(),
      notify: jest.fn(),
    };
    commonAuthService = {};
    commonGimService = {};
    commonCheckboxService = {
      resolveResidentIdAndEmitCreditCard: jest.fn(),
      registerDepositGim: jest.fn(),
    };
    gimService = { validateOpenTill: jest.fn() };
    dataSource = { createQueryRunner: jest.fn(() => queryRunner) };

    service = new CheckboxService(
      checkboxRepo as any,
      checkboxUserRepo as any,
      cardRepo as any,
      catalogRepo as any,
      commonService,
      commonAuthService,
      commonGimService,
      commonCheckboxService,
      gimService,
      dataSource,
    );

    (service as any).logger = { error: jest.fn(), log: jest.fn(), warn: jest.fn() };
    (handleDbExceptions as unknown as jest.Mock).mockClear();
  });

  // -------------------- getTransactions --------------------
  describe('getTransactions', () => {
    it('uses history table when year/month are valid and table exists, returns rows', async () => {
      // _tableExists -> first query call returns exists=true
      checkboxRepo.query
        .mockResolvedValueOnce([{ exists: true }])
        .mockResolvedValueOnce([{ id: 1 }]);

      const result = await service.getTransactions(1, { year: 2025, month: 5, currentMonth: false } as any, {} as any);

      expect(checkboxRepo.query).toHaveBeenCalledTimes(2);
      // Confirm the table name used the safe interpolated values: history
      // schema (where the archival cron creates the table) and a zero-padded
      // month to match the cron's `to_char(..., 'YYYY_MM')` naming.
      const dataQuery = (checkboxRepo.query as jest.Mock).mock.calls[1][0];
      expect(dataQuery).toContain('history."2025_05_checkbox"');
      expect(result).toEqual({ errorCode: ErrorCode.NONE, checkboxs: [{ id: 1 }] });
    });

    it('returns empty when table does not exist and currentMonth is false', async () => {
      checkboxRepo.query.mockResolvedValueOnce([{ exists: false }]);

      const result = await service.getTransactions(1, { year: 2025, month: 5, currentMonth: false } as any, {} as any);

      expect(result).toEqual({ checkboxs: [] });
      // Only the existence check should have run; no data query.
      expect(checkboxRepo.query).toHaveBeenCalledTimes(1);
    });

    it('rejects out-of-range year/month and falls back to current-month branch', async () => {
      // year out of range -> safeYear=null, month out of range -> safeMonth=null;
      // skips history; currentMonth=true filters by year=0 and month=0 (fallback).
      checkboxRepo.query.mockResolvedValueOnce([{ amount: 1 }]);

      const result = await service.getTransactions(
        1,
        { year: 1999, month: 99, currentMonth: true } as any,
        { limit: 5, offset: 0 } as any,
      );

      const [sql, params] = (checkboxRepo.query as jest.Mock).mock.calls[0];
      expect(sql).toContain('FROM checkbox cb');
      // Parameter order: userId, safeYear ?? 0, safeMonth ?? 0, limit, offset.
      expect(params).toEqual([1, 0, 0, 5, 0]);
      expect(result.errorCode).toBe(ErrorCode.NONE);
    });

    it('returns NOT_VALID when currentMonth produces no rows', async () => {
      checkboxRepo.query.mockResolvedValueOnce([{ exists: false }]).mockResolvedValueOnce([]);

      const result = await service.getTransactions(1, { year: 2025, month: 5, currentMonth: true } as any, {} as any);

      expect(result).toEqual({ errorCode: ErrorCode.NOT_VALID, checkboxs: [] });
    });

    it('on day 1 of the current month, unions current checkbox table even without currentMonth flag', async () => {
      // Pin "now" to the 1st via fake timers.
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2025-05-01T10:00:00Z'));

      checkboxRepo.query
        .mockResolvedValueOnce([{ exists: true }])
        .mockResolvedValueOnce([{ id: 9 }]);

      const result = await service.getTransactions(
        1,
        { year: 2025, month: 5, currentMonth: false } as any,
        {} as any,
      );

      const [sql] = (checkboxRepo.query as jest.Mock).mock.calls[1];
      expect(sql).toContain('UNION ALL');
      expect(result.errorCode).toBe(ErrorCode.NONE);

      jest.useRealTimers();
    });

    it('routes errors through handleDbExceptions', async () => {
      // First call resolves (_tableExists internal); second call (data query) throws.
      checkboxRepo.query
        .mockResolvedValueOnce([{ exists: true }])
        .mockRejectedValueOnce(new Error('boom'));

      await expect(
        service.getTransactions(1, { year: 2025, month: 5, currentMonth: true } as any, {} as any),
      ).rejects.toThrow('boom');
      expect(handleDbExceptions).toHaveBeenCalled();
    });

    it('_tableExists returns false on query error (internal catch)', async () => {
      checkboxRepo.query
        .mockRejectedValueOnce(new Error('regclass-fail'))
        .mockResolvedValueOnce([{ id: 1 }]);

      const result = await service.getTransactions(
        1,
        { year: 2025, month: 5, currentMonth: true } as any,
        {} as any,
      );

      expect(result.errorCode).toBe(ErrorCode.NONE);
    });
  });

  // -------------------- getTransactionsById --------------------
  describe('getTransactionsById', () => {
    it('returns the checkbox when found', async () => {
      checkboxRepo.__qb.getOne.mockResolvedValue({ id: 5 });

      const result = await service.getTransactionsById(1, 5);

      expect(result).toEqual({ errorCode: ErrorCode.NONE, checkbox: { id: 5 } });
    });

    it('returns NOT_FOUND when missing', async () => {
      checkboxRepo.__qb.getOne.mockResolvedValue(undefined);

      const result = await service.getTransactionsById(1, 5);

      expect(result).toEqual({ errorCode: ErrorCode.NOT_FOUND, checkbox: {} });
    });

    it('routes errors through handleDbExceptions', async () => {
      checkboxRepo.__qb.getOne.mockRejectedValue(new Error('db'));

      await expect(service.getTransactionsById(1, 5)).rejects.toThrow('db');
      expect(handleDbExceptions).toHaveBeenCalled();
    });
  });

  // -------------------- getCardsAndCheckboxes --------------------
  describe('getCardsAndCheckboxes', () => {
    it('returns cards and a positive balance', async () => {
      cardRepo.__qb.getMany.mockResolvedValue([{ id: 1 }]);
      checkboxUserRepo.__qb.getOne.mockResolvedValue({ checkboxes: 4 });

      const result = await service.getCardsAndCheckboxes(1);

      expect(result).toEqual({ errorCode: ErrorCode.NONE, cards: [{ id: 1 }], checkboxes: 4 });
    });

    it('returns zero balance when no CheckboxUser exists', async () => {
      cardRepo.__qb.getMany.mockResolvedValue([]);
      checkboxUserRepo.__qb.getOne.mockResolvedValue(null);

      const result = await service.getCardsAndCheckboxes(1);

      expect(result).toEqual({ errorCode: ErrorCode.NONE, cards: [], checkboxes: 0 });
    });

    it('routes errors through handleDbExceptions', async () => {
      cardRepo.__qb.getMany.mockRejectedValue(new Error('db'));

      await expect(service.getCardsAndCheckboxes(1)).rejects.toThrow('db');
      expect(handleDbExceptions).toHaveBeenCalled();
    });
  });

  // -------------------- buyCheckboxs --------------------
  describe('buyCheckboxs', () => {
    const baseDto: any = {
      userId: 1,
      transactionId: 'tx-1',
      typePaymentMethod: TypePaymentMethod.DEUNAV2,
      identityCard: '1234567890',
      credentialId: 9,
      amount: '10.00',
      commission: '0.50',
      checkboxes: 2,
      billing_data: {},
    };

    beforeEach(() => {
      gimService.validateOpenTill.mockResolvedValue({ errorCode: ErrorCode.NONE });
      // DEUNAV2 triggers the DEUNA pre-check inside buyCheckboxs.
      commonService.checkDeUnaByIdentityCard.mockResolvedValue({ errorCode: ErrorCode.NONE, url: 'deuna://x' });
      commonService.checkPlaceToPayByIdentityCard.mockResolvedValue({ errorCode: ErrorCode.NONE, url: 'pp://x' });
    });

    it('aborts when the till is closed', async () => {
      gimService.validateOpenTill.mockResolvedValue({ errorCode: ErrorCode.UNAUTHORIZED });

      const result = await service.buyCheckboxs('dev', baseDto);

      expect(result).toEqual({ errorCode: ErrorCode.UNAUTHORIZED });
    });

    it('rejects DEUNA with short identityCard', async () => {
      const result = await service.buyCheckboxs('dev', {
        ...baseDto,
        typePaymentMethod: TypePaymentMethod.DEUNA,
        identityCard: '123',
      });

      expect(result).toEqual({ errorCode: ErrorCode.RESPONSE });
    });

    it('rejects DEUNA when checkDeUnaByIdentityCard fails', async () => {
      commonService.checkDeUnaByIdentityCard.mockResolvedValue({ errorCode: ErrorCode.RESPONSE });

      const result = await service.buyCheckboxs('dev', {
        ...baseDto,
        typePaymentMethod: TypePaymentMethod.DEUNA,
      });

      expect(result).toEqual({ errorCode: ErrorCode.WAIT_TRANSACTION_PREVIEWS });
    });

    it('rejects DEUNA when checkDeUnaByIdentityCard returns null', async () => {
      commonService.checkDeUnaByIdentityCard.mockResolvedValue(null);

      const result = await service.buyCheckboxs('dev', {
        ...baseDto,
        typePaymentMethod: TypePaymentMethod.DEUNA,
      });

      expect(result).toEqual({ errorCode: ErrorCode.WAIT_TRANSACTION_PREVIEWS });
    });

    it('rejects PLACE_TO_PAY with short identityCard', async () => {
      const result = await service.buyCheckboxs('dev', {
        ...baseDto,
        typePaymentMethod: TypePaymentMethod.PLACE_TO_PAY,
        identityCard: '',
      });

      expect(result).toEqual({ errorCode: ErrorCode.RESPONSE });
    });

    it('rejects PLACE_TO_PAY when checkPlaceToPayByIdentityCard fails', async () => {
      commonService.checkPlaceToPayByIdentityCard.mockResolvedValue({ errorCode: ErrorCode.RESPONSE });

      const result = await service.buyCheckboxs('dev', {
        ...baseDto,
        typePaymentMethod: TypePaymentMethod.PLACE_TO_PAY,
      });

      expect(result).toEqual({ errorCode: ErrorCode.WAIT_TRANSACTION_PREVIEWS });
    });

    it('returns TRANSACTION_REPIT when a prior checkbox exists', async () => {
      checkboxRepo.findOne.mockResolvedValueOnce({ id: 1 });

      const result = await service.buyCheckboxs('dev', baseDto);

      expect(result).toEqual({ errorCode: ErrorCode.TRANSACTION_REPIT });
    });

    it('processes DEUNAV2 happy path (full flow including optionalData/concept)', async () => {
      jest.useFakeTimers();
      checkboxRepo.findOne
        .mockResolvedValueOnce(undefined) // prior-check
        .mockResolvedValueOnce({ id: 99, transactionId: 'tx-1' }); // final fetch
      commonService.payDeUnaV2.mockResolvedValue({ errorCode: ErrorCode.NONE, deeplink: 'deeplink://x' });

      const result = await service.buyCheckboxs('dev', {
        ...baseDto,
        optionalData: [
          { key: 'concept', value: 'CUSTOM' },
          { key: 'useGif', value: true },
        ],
      });

      expect(result.errorCode).toBe(ErrorCode.AWAITS_RESPONSE);
      expect(queryRunner.commitTransaction).toHaveBeenCalled();
      expect(queryRunner.release).toHaveBeenCalled();
      jest.useRealTimers();
    });

    it('processes AHORITA happy path', async () => {
      jest.useFakeTimers();
      checkboxRepo.findOne
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce({ id: 99 });
      commonService.payAhorita.mockResolvedValue({ errorCode: ErrorCode.NONE, deeplink: 'ah://x' });

      const result = await service.buyCheckboxs('dev', {
        ...baseDto,
        typePaymentMethod: TypePaymentMethod.AHORITA,
      });

      expect(result.errorCode).toBe(ErrorCode.AWAITS_RESPONSE);
      jest.useRealTimers();
    });

    it('processes PLACE_TO_PAY happy path', async () => {
      jest.useFakeTimers();
      commonService.checkPlaceToPayByIdentityCard.mockResolvedValue({ errorCode: ErrorCode.NONE, url: 'pp://x' });
      checkboxRepo.findOne
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce({ id: 99 });
      commonService.payPlaceToPay.mockResolvedValue({ errorCode: ErrorCode.NONE, deeplink: 'pp://deep' });

      const result = await service.buyCheckboxs('dev', {
        ...baseDto,
        typePaymentMethod: TypePaymentMethod.PLACE_TO_PAY,
      });

      expect(result.errorCode).toBe(ErrorCode.AWAITS_RESPONSE);
      jest.useRealTimers();
    });

    it('processes DEUNA pre-check happy path (URL captured but unmapped switch path returns UNAUTHORIZED)', async () => {
      commonService.checkDeUnaByIdentityCard.mockResolvedValue({ errorCode: ErrorCode.NONE, url: 'deuna://x' });
      checkboxRepo.findOne.mockResolvedValueOnce(undefined);

      // TypePaymentMethod.DEUNA is not handled in the switch -> default throws -> rollback -> UNAUTHORIZED.
      const result = await service.buyCheckboxs('dev', {
        ...baseDto,
        typePaymentMethod: TypePaymentMethod.DEUNA,
      });

      expect(result).toEqual({ errorCode: ErrorCode.UNAUTHORIZED });
      expect(queryRunner.rollbackTransaction).toHaveBeenCalled();
    });

    it('rolls back transaction on inner failure', async () => {
      checkboxRepo.findOne.mockResolvedValueOnce(undefined);
      // Provoke the default switch path (no typePaymentMethod match -> throws)
      const result = await service.buyCheckboxs('dev', {
        ...baseDto,
        typePaymentMethod: TypePaymentMethod.COOPMEGO,
      } as any);

      expect(result).toEqual({ errorCode: ErrorCode.UNAUTHORIZED });
      expect(queryRunner.rollbackTransaction).toHaveBeenCalled();
    });

    it('skips rollback when the transaction is not active anymore', async () => {
      checkboxRepo.findOne.mockResolvedValueOnce(undefined);
      // First save succeeds, second throws AFTER commit-state is gone.
      queryRunner.manager.save = jest.fn().mockImplementationOnce(async (e: any) => ({ id: 99, ...e })).mockImplementationOnce(async () => {
        queryRunner.isTransactionActive = false;
        throw new Error('after-active');
      });
      commonService.payAhorita.mockResolvedValue({ errorCode: ErrorCode.NONE, deeplink: 'd' });

      const result = await service.buyCheckboxs('dev', {
        ...baseDto,
        typePaymentMethod: TypePaymentMethod.AHORITA,
      });

      expect(result).toEqual({ errorCode: ErrorCode.UNAUTHORIZED });
      expect(queryRunner.rollbackTransaction).not.toHaveBeenCalled();
    });
  });

  // -------------------- _parseDebitAmounDto --------------------
  describe('_parseDebitAmounDto', () => {
    it('builds the DTO with useGif from optionalData', async () => {
      const dto: any = {
        credentialId: 1,
        amount: '5.00',
        userId: 1,
        transactionId: 't',
        optionalData: [{ key: 'useGif', value: true }],
        commission: '0.50',
        billing_data: {},
      };
      const result = await (service as any)._parseDebitAmounDto('CONCEPT', dto);
      expect(result.concept).toBe('CONCEPT');
      expect(result.purchase_data[0].product).toBe('CONCEPT');
    });

    it('swallows internal errors and returns undefined', async () => {
      // Force getDate to throw.
      commonService.getDate.mockImplementationOnce(() => {
        throw new Error('x');
      });
      const result = await (service as any)._parseDebitAmounDto('C', { optionalData: [] } as any);
      expect(result).toBeUndefined();
    });
  });

  // -------------------- _saveResponsePay --------------------
  describe('_saveResponsePay', () => {
    const baseCheckbox: any = { id: 1, userId: 1, checkboxes: 2, onResponseExternal: [] };

    it('creates a CheckboxUser when none exists (assignment branch)', async () => {
      commonCheckboxService.resolveResidentIdAndEmitCreditCard.mockResolvedValue({
        errorCode: ErrorCode.NONE,
        dataEmision: { ok: 1 },
      });
      commonCheckboxService.registerDepositGim.mockResolvedValue({
        errorCode: ErrorCode.NONE,
        dataDeposit: { ok: 1 },
      });
      checkboxUserRepo.findOne.mockResolvedValue(null);

      await service._saveResponsePay('dev', { ...baseCheckbox }, StatusMoment.LISTENING, StatusPayment.PAID);

      expect(checkboxUserRepo.create).toHaveBeenCalledWith({ userId: 1, checkboxes: 2 });
      expect(checkboxUserRepo.save).toHaveBeenCalled();
    });

    it('increments existing CheckboxUser balance', async () => {
      commonCheckboxService.resolveResidentIdAndEmitCreditCard.mockResolvedValue({
        errorCode: ErrorCode.NONE,
        dataEmision: { ok: 1 },
      });
      commonCheckboxService.registerDepositGim.mockResolvedValue({
        errorCode: ErrorCode.NONE,
        dataDeposit: { ok: 1 },
      });
      const existing: any = { userId: 1, checkboxes: 3 };
      checkboxUserRepo.findOne.mockResolvedValue(existing);

      await service._saveResponsePay('dev', { ...baseCheckbox }, StatusMoment.LISTENING, StatusPayment.PAID);

      expect(existing.checkboxes).toBe(5);
      expect(checkboxUserRepo.save).toHaveBeenCalledWith(existing);
    });

    it('handles GIM emission failure (with dataEmision)', async () => {
      commonCheckboxService.resolveResidentIdAndEmitCreditCard.mockResolvedValue({
        errorCode: ErrorCode.RESPONSE,
        dataEmision: { failed: 1 },
      });
      const cb = { ...baseCheckbox, onResponseExternal: [] };

      await service._saveResponsePay('dev', cb, StatusMoment.LISTENING, StatusPayment.PAID);

      // Emission failed -> deposit branch is NOT taken; no CheckboxUser ops.
      expect(commonCheckboxService.registerDepositGim).not.toHaveBeenCalled();
      expect(cb.onResponseExternal).toContainEqual({ failed: 1 });
    });

    it('handles GIM deposit failure', async () => {
      commonCheckboxService.resolveResidentIdAndEmitCreditCard.mockResolvedValue({
        errorCode: ErrorCode.NONE,
        dataEmision: { ok: 1 },
      });
      commonCheckboxService.registerDepositGim.mockResolvedValue({
        errorCode: ErrorCode.RESPONSE,
        dataDeposit: { fail: 1 },
      });
      checkboxUserRepo.findOne.mockResolvedValue(null);

      const cb = { ...baseCheckbox, onResponseExternal: [] };
      await service._saveResponsePay('dev', cb, StatusMoment.LISTENING, StatusPayment.PAID);

      expect(cb.onResponseExternal).toContainEqual({ fail: 1 });
    });

    it('falls back to CORRECTLY_PAID_UNASSIGNED on internal failure', async () => {
      commonCheckboxService.resolveResidentIdAndEmitCreditCard.mockRejectedValue(new Error('boom'));
      const cb = { ...baseCheckbox };

      await service._saveResponsePay('dev', cb, StatusMoment.LISTENING, StatusPayment.PAID);

      expect(cb.moment).toBe(StatusMoment.LISTENING);
      expect(cb.statusPayment).toBe(StatusPayment.PAID);
    });

    it('skips assignment when statusPayment is not PAID', async () => {
      const cb = { ...baseCheckbox };
      await service._saveResponsePay('dev', cb, StatusMoment.RESPONSE, StatusPayment.ERROR);

      expect(commonCheckboxService.resolveResidentIdAndEmitCreditCard).not.toHaveBeenCalled();
      expect(cb.moment).toBe(StatusMoment.RESPONSE);
      expect(cb.statusPayment).toBe(StatusPayment.ERROR);
    });
  });

  // -------------------- payment provider helpers (setTimeout flows) --------------------
  describe('payment provider helpers (timer branches)', () => {
    const baseCheckbox: any = { id: 7, userId: 1, checkboxes: 1, onResponseExternal: [] };
    const debitAmounDto: any = {
      register: 'R',
      concept: 'C',
      purchase_data: [],
      billing_data: {},
      transactionId: 't',
    };
    const dto: any = {
      userId: 1,
      typePaymentMethod: TypePaymentMethod.DEUNAV2,
      credentialId: 1,
      amount: '5',
      commission: '0.5',
      identityCard: '0',
    };

    beforeEach(() => {
      jest.useFakeTimers();
      commonCheckboxService.resolveResidentIdAndEmitCreditCard.mockResolvedValue({ errorCode: ErrorCode.NONE });
      commonCheckboxService.registerDepositGim.mockResolvedValue({ errorCode: ErrorCode.NONE });
    });
    afterEach(() => jest.useRealTimers());

    it('_payDeunaV2: provider error path triggers immediate _saveResponsePay with ERROR', async () => {
      commonService.payDeUnaV2.mockResolvedValue({ errorCode: ErrorCode.RESPONSE });

      const result = await (service as any)._payDeunaV2('dev', baseCheckbox, debitAmounDto, dto, undefined);

      expect(result).toEqual({ errorCode: ErrorCode.RESPONSE });
      expect(commonService.notify).toHaveBeenCalled();
    });

    it('_payDeunaV2: timer fires - not paid -> ERROR path', async () => {
      commonService.payDeUnaV2.mockResolvedValue({ errorCode: ErrorCode.NONE, deeplink: 'd' });
      checkboxRepo.findOne.mockResolvedValue({ ...baseCheckbox, statusPayment: StatusPayment.WAITING });

      const result = await (service as any)._payDeunaV2('dev', baseCheckbox, debitAmounDto, dto, undefined);
      expect(result.errorCode).toBe(ErrorCode.NONE);

      await jest.runAllTimersAsync();
      // After timeout, _saveResponsePay should have been called.
      expect(checkboxRepo.save).toHaveBeenCalled();
    });

    it('_payDeunaV2: timer fires - already paid -> early return', async () => {
      commonService.payDeUnaV2.mockResolvedValue({ errorCode: ErrorCode.NONE, deeplink: 'd' });
      checkboxRepo.findOne.mockResolvedValue({ ...baseCheckbox, statusPayment: StatusPayment.PAID });

      await (service as any)._payDeunaV2('dev', baseCheckbox, debitAmounDto, dto, undefined);
      await jest.runAllTimersAsync();
      // Should not call notify after PAID short-circuit.
      expect(commonService.notify).not.toHaveBeenCalled();
    });

    it('_payDeunaV2: timer fires - checkbox missing -> early return', async () => {
      commonService.payDeUnaV2.mockResolvedValue({ errorCode: ErrorCode.NONE, deeplink: 'd' });
      checkboxRepo.findOne.mockResolvedValue(undefined);

      await (service as any)._payDeunaV2('dev', baseCheckbox, debitAmounDto, dto, 99 as any);
      await jest.runAllTimersAsync();
      expect(commonService.notify).not.toHaveBeenCalled();
    });

    it('_payAhorita: provider error path', async () => {
      commonService.payAhorita.mockResolvedValue({ errorCode: ErrorCode.RESPONSE });
      const result = await (service as any)._payAhorita('dev', baseCheckbox, debitAmounDto, dto, undefined);
      expect(result).toEqual({ errorCode: ErrorCode.RESPONSE });
    });

    it('_payAhorita: timer fires - not paid', async () => {
      commonService.payAhorita.mockResolvedValue({ errorCode: ErrorCode.NONE, deeplink: 'a' });
      checkboxRepo.findOne.mockResolvedValue({ ...baseCheckbox, statusPayment: StatusPayment.WAITING });

      await (service as any)._payAhorita('dev', baseCheckbox, debitAmounDto, dto, undefined);
      await jest.runAllTimersAsync();
      expect(checkboxRepo.save).toHaveBeenCalled();
    });

    it('_payAhorita: timer fires - already paid', async () => {
      commonService.payAhorita.mockResolvedValue({ errorCode: ErrorCode.NONE, deeplink: 'a' });
      checkboxRepo.findOne.mockResolvedValue({ ...baseCheckbox, statusPayment: StatusPayment.PAID });

      await (service as any)._payAhorita('dev', baseCheckbox, debitAmounDto, dto, 5 as any);
      await jest.runAllTimersAsync();
      expect(commonService.notify).not.toHaveBeenCalled();
    });

    it('_payAhorita: timer fires - checkbox missing', async () => {
      commonService.payAhorita.mockResolvedValue({ errorCode: ErrorCode.NONE, deeplink: 'a' });
      checkboxRepo.findOne.mockResolvedValue(undefined);
      await (service as any)._payAhorita('dev', baseCheckbox, debitAmounDto, dto, undefined);
      await jest.runAllTimersAsync();
      expect(commonService.notify).not.toHaveBeenCalled();
    });

    it('_payPlaceToPay: provider error path', async () => {
      commonService.payPlaceToPay.mockResolvedValue({ errorCode: ErrorCode.RESPONSE });
      const result = await (service as any)._payPlaceToPay('dev', baseCheckbox, debitAmounDto, dto, undefined);
      expect(result).toEqual({ errorCode: ErrorCode.RESPONSE });
    });

    it('_payPlaceToPay: timer fires - not paid', async () => {
      commonService.payPlaceToPay.mockResolvedValue({ errorCode: ErrorCode.NONE, deeplink: 'p' });
      checkboxRepo.findOne.mockResolvedValue({ ...baseCheckbox, statusPayment: StatusPayment.WAITING });
      await (service as any)._payPlaceToPay('dev', baseCheckbox, debitAmounDto, dto, undefined);
      await jest.runAllTimersAsync();
      expect(checkboxRepo.save).toHaveBeenCalled();
    });

    it('_payPlaceToPay: timer fires - already paid', async () => {
      commonService.payPlaceToPay.mockResolvedValue({ errorCode: ErrorCode.NONE, deeplink: 'p' });
      checkboxRepo.findOne.mockResolvedValue({ ...baseCheckbox, statusPayment: StatusPayment.PAID });
      await (service as any)._payPlaceToPay('dev', baseCheckbox, debitAmounDto, dto, 1 as any);
      await jest.runAllTimersAsync();
      expect(commonService.notify).not.toHaveBeenCalled();
    });

    it('_payPlaceToPay: timer fires - checkbox missing', async () => {
      commonService.payPlaceToPay.mockResolvedValue({ errorCode: ErrorCode.NONE, deeplink: 'p' });
      checkboxRepo.findOne.mockResolvedValue(undefined);
      await (service as any)._payPlaceToPay('dev', baseCheckbox, debitAmounDto, dto, undefined);
      await jest.runAllTimersAsync();
      expect(commonService.notify).not.toHaveBeenCalled();
    });
  });

  // -------------------- onResponsePay / onResponsePayError --------------------
  describe('onResponsePay', () => {
    it('returns NOT_FOUND when checkbox is missing', async () => {
      checkboxRepo.findOne.mockResolvedValue(undefined);
      const result = await service.onResponsePay('dev', 1, 1, 5001, 'R', 0 as any);
      expect(result).toEqual({ errorCode: ErrorCode.NOT_FOUND });
    });

    it('returns NOT_FOUND when statusPayment is not WAITING', async () => {
      checkboxRepo.findOne.mockResolvedValue({ id: 1, statusPayment: StatusPayment.PAID, amount: 5 });
      const result = await service.onResponsePay('dev', 1, 1, 5001, 'R', 0 as any);
      expect(result).toEqual({ errorCode: ErrorCode.NOT_FOUND });
    });

    it('saves and notifies when waiting', async () => {
      commonCheckboxService.resolveResidentIdAndEmitCreditCard.mockResolvedValue({ errorCode: ErrorCode.NONE });
      commonCheckboxService.registerDepositGim.mockResolvedValue({ errorCode: ErrorCode.NONE });
      checkboxRepo.findOne
        .mockResolvedValueOnce({ id: 1, statusPayment: StatusPayment.WAITING, amount: 5, userId: 1, checkboxes: 1, onResponseExternal: [] });
      checkboxUserRepo.findOne.mockResolvedValue(null);

      const result = await service.onResponsePay('dev', 1, 1, 5001, 'R', 0 as any);

      expect(result).toEqual({ errorCode: ErrorCode.NONE });
      expect(commonService.notify).toHaveBeenCalled();
    });
  });

  describe('onResponsePayError', () => {
    it('returns NOT_FOUND when checkbox is missing', async () => {
      checkboxRepo.findOne.mockResolvedValue(undefined);
      const result = await service.onResponsePayError('dev', 1, 1, 5001, 'R', 0 as any);
      expect(result).toEqual({ errorCode: ErrorCode.NOT_FOUND });
    });

    it('saves response and notifies on error path', async () => {
      checkboxRepo.findOne.mockResolvedValueOnce({ id: 1, userId: 1, checkboxes: 1, onResponseExternal: [] });
      const result = await service.onResponsePayError('dev', 1, 1, 5001, 'R', 0 as any);
      expect(result).toEqual({ errorCode: ErrorCode.NONE });
      expect(commonService.notify).toHaveBeenCalled();
    });
  });
});
