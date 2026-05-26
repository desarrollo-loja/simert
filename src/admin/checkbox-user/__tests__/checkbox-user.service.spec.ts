import { CheckboxUserService } from '../checkbox-user.service';

const buildRepoMock = () => ({
  createQueryBuilder: jest.fn(),
  count: jest.fn(),
});

describe('CheckboxUserService', () => {
  let service: CheckboxUserService;

  beforeEach(() => {
    service = new CheckboxUserService(
      buildRepoMock() as any,
      buildRepoMock() as any,
      buildRepoMock() as any,
    );
  });

  it('is defined', () => {
    expect(service).toBeDefined();
  });

  it('create returns the stub message', () => {
    expect(service.create({} as any)).toBe('This action adds a new checkboxUser');
  });

  it('findAll returns the stub message', () => {
    expect(service.findAll()).toBe('This action returns all checkboxUser');
  });

  it('findOne returns the stub message with id', () => {
    expect(service.findOne(3)).toBe('This action returns a #3 checkboxUser');
  });

  it('update returns the stub message with id', () => {
    expect(service.update(4, {} as any)).toBe('This action updates a #4 checkboxUser');
  });

  it('remove returns the stub message with id', () => {
    expect(service.remove(5)).toBe('This action removes a #5 checkboxUser');
  });
});
