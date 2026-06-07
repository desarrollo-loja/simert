import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import * as fs from 'fs';
import { ApiStandardResponse } from 'src/common/decorators/api-standard-response.decorator';
/**
 * REST controller exposing the application root metadata endpoint
 * (name, version, author, architect and url read from package.json).
 *
 * Base route: `/` (root). Injects no service; resolves metadata inline.
 */
@ApiTags('App')
@ApiBearerAuth('keycloak')
@Controller()
export class AppController {
  /**
   * Returns the application root metadata read from package.json.
   *
   * @returns Object containing the application name, version, url, author and architect.
   */
  @ApiOperation({
    summary:
      'Application root metadata (name, version, author, architect, url)',
  })
  @ApiStandardResponse({
    description: 'Application metadata read from package.json',
    data: {
      name: { type: 'string', example: 'parking_simert' },
      version: { type: 'string', example: '1.0.0' },
      url: { type: 'string', example: 'https://clipp.app' },
      author: { type: 'string', example: 'Clipp' },
      architect: { type: 'string', example: 'Clipp Team' },
    },
  })
  @Get()
  getRoot(): object {
    const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf-8'));
    const version = packageJson.version;
    const name = packageJson.name;
    const url = packageJson.url;
    const author = packageJson.author;
    const architect = packageJson.architect;
    return {
      name: name,
      version: version,
      url: url,
      author: author,
      architect: architect,
    };
  }
}
