import { Repository } from 'typeorm';

import { IncidentPayment } from '../entities/incident-payment.entity';
import { IncidentPaymentService } from '../incident-payment.service';

describe('IncidentPaymentService', () => {
  it('should be defined', () => {
    const repository = {} as Repository<IncidentPayment>;
    expect(new IncidentPaymentService(repository)).toBeDefined();
  });
});
