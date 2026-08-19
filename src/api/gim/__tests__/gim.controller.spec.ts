import { CreateClientGimDto } from 'src/common/dto/create-client-gim.dto';
import { CreateClientGimNotExistDto } from 'src/common/dto/create-client-gim-not-exist.dto';
import { EmissionCreditCardDto } from 'src/common/dto/emission-credit-card.dto';
import { EmissionSanctionDto } from 'src/common/dto/emission-sanction.dto';
import { RegisterDepositGimDto } from 'src/common/dto/register-deposit-gim.dto';

import { CreateGimDto } from '../dto/create-gim.dto';
import FindBondNumberDto from '../dto/find-bond-number';
import { GetClientGimByCitationDto, GetClientGimDto } from '../dto/get-client-gim.dto';
import { ValidateStatusGimDto } from '../dto/validate-status-gim.dto';
import { GimController } from '../gim.controller';
import { GimService } from '../gim.service';

// Direct instantiation avoids pulling the Nest DI graph (guards/JwtService).
const buildServiceMock = () => ({
  issueIncidentGim: jest.fn(),
  emitInfractionSimert: jest.fn(),
  createNewNaturalPersonGim: jest.fn(),
  createNewNaturalPersonGimNoExist: jest.fn(),
  getUserByIdentityCardGim: jest.fn(),
  findBondByNumber: jest.fn(),
  verifateIncidentGim: jest.fn(),
  validateOpenTill: jest.fn(),
  findVehicleTypesForSimert: jest.fn(),
  emissionTitleCreditCard: jest.fn(),
  registerDeposit: jest.fn(),
  findObligations: jest.fn(),
  findObligationsByCitation: jest.fn(),
  validateStatusSistemWithGim: jest.fn(),
  emitSanction: jest.fn(),
});

describe('GimController', () => {
  let controller: GimController;
  let service: ReturnType<typeof buildServiceMock>;
  const fakeResult = { ok: true } as any;

  beforeEach(() => {
    service = buildServiceMock();
    controller = new GimController(service as unknown as GimService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('issueIncidentGim delegates and parses id', async () => {
    service.issueIncidentGim.mockResolvedValue(fakeResult);
    const dto = {} as CreateGimDto;
    const result = await controller.issueIncidentGim(dto, 'u', 'd', '42', 1);
    expect(service.issueIncidentGim).toHaveBeenCalledWith(dto, 42, 1, undefined);
    expect(result).toBe(fakeResult);
  });

  it('issueIncidentGim forwards the acting user so the audit trail records it', async () => {
    service.issueIncidentGim.mockResolvedValue(fakeResult);
    const dto = {} as CreateGimDto;
    await controller.issueIncidentGim(dto, '17', 'd', '42', 1);
    expect(service.issueIncidentGim).toHaveBeenCalledWith(dto, 42, 1, 17);
  });

  it('emitInfractionSimert delegates and parses id', async () => {
    service.emitInfractionSimert.mockResolvedValue(fakeResult);
    const dto = {} as CreateGimDto;
    const result = await controller.emitInfractionSimert(dto, 'u', 'd', '99', 0);
    expect(service.emitInfractionSimert).toHaveBeenCalledWith(
      dto,
      99,
      0,
      undefined,
    );
    expect(result).toBe(fakeResult);
  });

  it('emitInfractionSimert forwards the acting user so the audit trail records it', async () => {
    service.emitInfractionSimert.mockResolvedValue(fakeResult);
    const dto = {} as CreateGimDto;
    await controller.emitInfractionSimert(dto, '17', 'd', '99', 0);
    expect(service.emitInfractionSimert).toHaveBeenCalledWith(dto, 99, 0, 17);
  });

  it('createClientGim delegates', async () => {
    service.createNewNaturalPersonGim.mockResolvedValue(fakeResult);
    const dto = {} as CreateClientGimDto;
    const result = await controller.createClientGim(dto, 'd');
    expect(service.createNewNaturalPersonGim).toHaveBeenCalledWith(dto);
    expect(result).toBe(fakeResult);
  });

  it('createClientGimNoExist delegates', async () => {
    service.createNewNaturalPersonGimNoExist.mockResolvedValue(fakeResult);
    const dto = {} as CreateClientGimNotExistDto;
    const result = await controller.createClientGimNoExist(dto, 'd');
    expect(service.createNewNaturalPersonGimNoExist).toHaveBeenCalledWith(dto);
    expect(result).toBe(fakeResult);
  });

  it('getClientGim delegates with identificationNumber', async () => {
    service.getUserByIdentityCardGim.mockResolvedValue(fakeResult);
    const dto = { identificationNumber: '1' } as GetClientGimDto;
    const result = await controller.getClientGim(dto, 'd');
    expect(service.getUserByIdentityCardGim).toHaveBeenCalledWith('1');
    expect(result).toBe(fakeResult);
  });

  it('findBondByNumber delegates', async () => {
    service.findBondByNumber.mockResolvedValue(fakeResult);
    const dto = {} as FindBondNumberDto;
    const result = await controller.findBondByNumber(dto, 'u', 'd');
    expect(service.findBondByNumber).toHaveBeenCalledWith(dto);
    expect(result).toBe(fakeResult);
  });

  it('verifateIncidentGim delegates', async () => {
    service.verifateIncidentGim.mockResolvedValue(fakeResult);
    const result = await controller.verifateIncidentGim('u', 'd', '7');
    expect(service.verifateIncidentGim).toHaveBeenCalledWith('7');
    expect(result).toBe(fakeResult);
  });

  it('validateOpenTill delegates', async () => {
    service.validateOpenTill.mockResolvedValue(fakeResult);
    const result = await controller.validateOpenTill({} as any, 'u', 'd', '1');
    expect(service.validateOpenTill).toHaveBeenCalled();
    expect(result).toBe(fakeResult);
  });

  it('findVehicleTypesForSimert delegates', async () => {
    service.findVehicleTypesForSimert.mockResolvedValue(fakeResult);
    const result = await controller.findVehicleTypesForSimert('u', 'd');
    expect(service.findVehicleTypesForSimert).toHaveBeenCalled();
    expect(result).toBe(fakeResult);
  });

  it('emissionTitleCreditCard delegates', async () => {
    service.emissionTitleCreditCard.mockResolvedValue(fakeResult);
    const dto = {} as EmissionCreditCardDto;
    const result = await controller.emissionTitleCreditCard('u', 'd', dto);
    expect(service.emissionTitleCreditCard).toHaveBeenCalledWith(dto);
    expect(result).toBe(fakeResult);
  });

  it('registerDeposit delegates', async () => {
    service.registerDeposit.mockResolvedValue(fakeResult);
    const dto = {} as RegisterDepositGimDto;
    const result = await controller.registerDeposit('u', 'd', dto);
    expect(service.registerDeposit).toHaveBeenCalledWith(dto);
    expect(result).toBe(fakeResult);
  });

  it('findObligations delegates', async () => {
    service.findObligations.mockResolvedValue(fakeResult);
    const dto = {} as GetClientGimDto;
    const result = await controller.findObligations('u', 'd', dto);
    expect(service.findObligations).toHaveBeenCalledWith(dto);
    expect(result).toBe(fakeResult);
  });

  it('findObligationsByCitation delegates', async () => {
    service.findObligationsByCitation.mockResolvedValue(fakeResult);
    const dto = { nroTicket: '1', identityCard: '2' } as GetClientGimByCitationDto;
    const result = await controller.findObligationsByCitation('u', 'd', dto);
    expect(service.findObligationsByCitation).toHaveBeenCalledWith('1', '2');
    expect(result).toBe(fakeResult);
  });

  it('validateStatusWithGim delegates', async () => {
    service.validateStatusSistemWithGim.mockResolvedValue(fakeResult);
    const dto = {
      debtDataObligations: [{ status: 1 } as any],
      incidentId: 5,
      createGimDto: { plate: 'P' } as any,
      isTransacional: 1,
    } as ValidateStatusGimDto;
    const result = await controller.validateStatusWithGim('u', 'd', dto);
    expect(service.validateStatusSistemWithGim).toHaveBeenCalledWith(
      dto.debtDataObligations,
      5,
      dto.createGimDto,
      1,
      undefined,
    );
    expect(result).toBe(fakeResult);
  });

  it('validateStatusWithGim forwards the acting user so the audit trail records it', async () => {
    service.validateStatusSistemWithGim.mockResolvedValue(fakeResult);
    const dto = {
      debtDataObligations: [{ status: 1 } as any],
      incidentId: 5,
      createGimDto: { plate: 'P' } as any,
      isTransacional: 1,
    } as ValidateStatusGimDto;
    await controller.validateStatusWithGim('17', 'd', dto);
    expect(service.validateStatusSistemWithGim).toHaveBeenCalledWith(
      dto.debtDataObligations,
      5,
      dto.createGimDto,
      1,
      17,
    );
  });

  it('emitSanction delegates', async () => {
    service.emitSanction.mockResolvedValue(fakeResult);
    const dto = {} as EmissionSanctionDto;
    const result = await controller.emitSanction('u', 'd', dto);
    expect(service.emitSanction).toHaveBeenCalledWith(dto);
    expect(result).toBe(fakeResult);
  });
});
