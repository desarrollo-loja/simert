import { PortalService } from '../portal.service';

describe('PortalService', () => {
  const service = new PortalService();

  it('findAll returns stub message', () => {
    expect(service.findAll()).toBe('This action returns all portal');
  });

  it('findOne returns stub message with id', () => {
    expect(service.findOne(5)).toBe('This action returns a #5 portal');
  });
});
