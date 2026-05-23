import { Injectable } from '@nestjs/common';

/**
 * Stub service for the Portal resource. Placeholder implementation pending
 * portal endpoint definition.
 */
@Injectable()
export class PortalService {

  findAll() {
    return `This action returns all portal`;
  }

  findOne(id: number) {
    return `This action returns a #${id} portal`;
  }
}
