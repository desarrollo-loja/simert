import { IncidentPaymentController } from '../incident-payment.controller';
import { IncidentPaymentService } from '../incident-payment.service';

describe('IncidentPaymentController', () => {
  it('should be defined', () => {
    const controller = new IncidentPaymentController({} as IncidentPaymentService);
    expect(controller).toBeDefined();
  });
});
