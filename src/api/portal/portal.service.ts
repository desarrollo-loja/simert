import { Injectable } from '@nestjs/common';

/**
 * Stub service for the Portal resource. Placeholder implementation pending
 * portal endpoint definition.
 */
@Injectable()
export class PortalService {
  /**
   * Returns a placeholder message for the portal list action.
   * @returns A placeholder string describing the list-all portal action.
   */
  findAll() {
    return `This action returns all portal`;
  }

  /**
   * Returns a placeholder message for retrieving a single portal entry.
   * @param id Identifier of the portal entry to retrieve.
   * @returns A placeholder string describing the find-one portal action.
   */
  findOne(id: number) {
    return `This action returns a #${id} portal`;
  }
}
