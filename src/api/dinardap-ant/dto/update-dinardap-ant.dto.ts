import { PartialType } from '@nestjs/swagger';

import { CreateDinardapAntDto } from './create-dinardap-ant.dto';

/**
 *
 */
export class UpdateDinardapAntDto extends PartialType(CreateDinardapAntDto) {}
