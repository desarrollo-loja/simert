import { IsNumber, IsString, IsUUID } from 'class-validator';
import { StatusMoment } from 'src/common/glob/status/status_moment';
import { StatusPayment } from 'src/common/glob/status/status_payment';
import { TypePaymentMethod } from 'src/common/glob/type/type_payment_method';

/**
 *
 */
export class CreateIncidentPaymentDto {
  @IsNumber()
  incidentId: number;

  @IsString()
  referenceId: string;

  @IsUUID()
  transactionId: string;

  @IsNumber()
  moment: StatusMoment;

  @IsNumber()
  typePaymentMethod: TypePaymentMethod;

  @IsNumber()
  statusPayment: StatusPayment;
}
