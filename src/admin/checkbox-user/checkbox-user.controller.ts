import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import { CheckboxUserService } from './checkbox-user.service';
import { CreateCheckboxUserDto } from './dto/create-checkbox-user.dto';
import { UpdateCheckboxUserDto } from './dto/update-checkbox-user.dto';

/**
 * REST controller for managing checkbox-user balance associations.
 *
 * Base route: `admin/checkbox-user`. Delegates all business logic to {@link CheckboxUserService}.
 */
@ApiTags('Admin - Checkbox User')
@ApiBearerAuth('keycloak')
@Controller('admin/checkbox-user')
export class CheckboxUserController {
  constructor(private readonly checkboxUserService: CheckboxUserService) { }

  /**
   * Creates a new checkbox-user association.
   *
   * @param createCheckboxUserDto - Payload for the new association.
   * @returns Placeholder response (stub implementation).
   */
  @ApiOperation({ summary: 'Create a new checkbox-user association' })
  @Post()
  create(@Body() createCheckboxUserDto: CreateCheckboxUserDto) {
    return this.checkboxUserService.create(createCheckboxUserDto);
  }

  /**
   * Returns all checkbox-user associations.
   *
   * @returns Placeholder response (stub implementation).
   */
  @ApiOperation({ summary: 'List all checkbox-user associations' })
  @Get()
  findAll() {
    return this.checkboxUserService.findAll();
  }

  /**
   * Returns a single checkbox-user association by its numeric ID.
   *
   * @param id - Path param: primary key of the association.
   * @returns Placeholder response (stub implementation).
   */
  @ApiOperation({ summary: 'Get a single checkbox-user association by id' })
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.checkboxUserService.findOne(+id);
  }

  /**
   * Applies a partial update to a checkbox-user association.
   *
   * @param id - Path param: primary key of the association to update.
   * @param updateCheckboxUserDto - Fields to update.
   * @returns Placeholder response (stub implementation).
   */
  @ApiOperation({ summary: 'Update a checkbox-user association by id' })
  @Patch(':id')
  update(@Param('id') id: string, @Body() updateCheckboxUserDto: UpdateCheckboxUserDto) {
    return this.checkboxUserService.update(+id, updateCheckboxUserDto);
  }

  /**
   * Deletes a checkbox-user association by its numeric ID.
   *
   * @param id - Path param: primary key of the association to delete.
   * @returns Placeholder response (stub implementation).
   */
  @ApiOperation({ summary: 'Delete a checkbox-user association by id' })
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.checkboxUserService.remove(+id);
  }
}
