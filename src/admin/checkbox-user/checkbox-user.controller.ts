import { Body, Controller, Delete, Get, Param, ParseIntPipe, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthWithKeycloak } from 'src/auth/decorators';
import { FilterDto } from 'src/common/dto/filter.dto';
import { TypeRol } from 'src/common/glob/type/type_rol';

import { CheckboxUserService } from './checkbox-user.service';
import { CreateCheckboxUserDto } from './dto/create-checkbox-user.dto';
import { UpdateCheckboxUserDto } from './dto/update-checkbox-user.dto';

/**
 * REST controller for managing checkbox-user balance associations and the
 * digital-consumption report ("Consumo Digital").
 *
 * Base route: `admin/checkbox-user`.
 */
@ApiTags('Admin - Checkbox User')
@ApiBearerAuth('keycloak')
@Controller('admin/checkbox-user')
export class CheckboxUserController {
  constructor(private readonly checkboxUserService: CheckboxUserService) { }

  @ApiOperation({ summary: 'Digital consumption report: balance, top-ups and consumption per user' })
  @AuthWithKeycloak(TypeRol.ADMIN)
  @Get('report/:userId/:idDevice/:version')
  findReport(
    @Param('userId', ParseIntPipe) _userId: number,
    @Param('idDevice', ParseUUIDPipe) _idDevice: string,
    @Param('version', ParseIntPipe) _version: number,
    @Query() filterDto: FilterDto,
  ) {
    return this.checkboxUserService.findReport(filterDto);
  }

  @ApiOperation({ summary: 'Total rows of the digital-consumption report (pagination)' })
  @AuthWithKeycloak(TypeRol.ADMIN)
  @Get('report/total/:userId/:idDevice/:version')
  findReportTotal(
    @Param('userId', ParseIntPipe) _userId: number,
    @Param('idDevice', ParseUUIDPipe) _idDevice: string,
    @Param('version', ParseIntPipe) _version: number,
    @Query() filterDto: FilterDto,
  ) {
    return this.checkboxUserService.findReportTotal(filterDto);
  }

  @ApiOperation({ summary: 'Create a new checkbox-user association' })
  @Post()
  create(@Body() createCheckboxUserDto: CreateCheckboxUserDto) {
    return this.checkboxUserService.create(createCheckboxUserDto);
  }

  @ApiOperation({ summary: 'List all checkbox-user associations' })
  @Get()
  findAll() {
    return this.checkboxUserService.findAll();
  }

  @ApiOperation({ summary: 'Get a single checkbox-user association by id' })
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.checkboxUserService.findOne(+id);
  }

  @ApiOperation({ summary: 'Update a checkbox-user association by id' })
  @Patch(':id')
  update(@Param('id') id: string, @Body() updateCheckboxUserDto: UpdateCheckboxUserDto) {
    return this.checkboxUserService.update(+id, updateCheckboxUserDto);
  }

  @ApiOperation({ summary: 'Delete a checkbox-user association by id' })
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.checkboxUserService.remove(+id);
  }
}
