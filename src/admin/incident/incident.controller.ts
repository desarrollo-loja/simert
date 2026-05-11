import { BadRequestException, Body, Controller, Delete, Get, Param, ParseIntPipe, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthWithKeycloak, GetUser } from 'src/auth/decorators';
import { JwtPayload } from 'src/auth/interfaces';
import { FilterDto } from 'src/common/dto/filter.dto';
import { TypeRol } from 'src/common/glob/type/type_rol';

import { CreateIncidentDto } from './dto/create-incident.dto';
import { IncidentDto } from './dto/incident.dto';
import { IncidentFilterDto } from './dto/incident-filterdto.dto';
import { UpdateIncidentDto } from './dto/update-incident.dto';
import { IncidentService } from './incident.service';
@ApiTags('Admin - Incident')
@ApiBearerAuth('keycloak')
@Controller('admin/incident')
export class IncidentController {
  constructor(private readonly incidentService: IncidentService) { }

  @ApiOperation({ summary: 'Create a new incident record' })
  @Post()
  create(@Body() createIncidentDto: CreateIncidentDto) {
    return this.incidentService.create(createIncidentDto);
  }

  @ApiOperation({ summary: 'List incidents with filters (admin role required)' })
  @AuthWithKeycloak(TypeRol.ADMIN)
  @Patch('find-all/:userId/:idDevice')
  findAll(
    @GetUser() user: JwtPayload,
    @Param('userId', ParseIntPipe) userId: number,
    @Param('idDevice', ParseUUIDPipe) idDevice: string,
    @Body() filterDto: IncidentFilterDto) {
    return this.incidentService.findAll(filterDto, user);
  }

  @ApiOperation({ summary: 'Count total incidents matching filters (admin role required)' })
  // @AuthWithKeycloak(TypeRol.ADMIN)
  @Patch('find-all-total/:userId/:idDevice')
  findAllTotal(
    @GetUser() user: JwtPayload,
    @Param('userId', ParseIntPipe) userId: number,
    @Param('idDevice', ParseUUIDPipe) idDevice: string,
    @Body() filterDto: IncidentFilterDto) {
    return this.incidentService.findAllTotal(filterDto, user);
  }

  @ApiOperation({ summary: 'Get a single incident by id' })
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.incidentService.findOne(+id);
  }

  @ApiOperation({ summary: 'Update an incident (isTransacional=1 wraps in DB transaction)' })
  @Patch('update/:userId/:idDevice/:id/:isTransacional')
  update(
    @Param('userId', ParseIntPipe) userId: number,
    @Param('idDevice', ParseUUIDPipe) idDevice: string,
    @Param('id') id: string,
    @Param('isTransacional', ParseIntPipe) isTransacional: number,
    @Body() updateIncidentDto: UpdateIncidentDto) {
    return this.incidentService.update(+id, updateIncidentDto, isTransacional);
  }

  @ApiOperation({ summary: 'Update incident GIM sync status after external emission' })
  @Patch('update-status-gim/:userId/:idDevice/:id')
  updateStatusGim(
    @Param('userId', ParseIntPipe) userId: number,
    @Param('idDevice', ParseUUIDPipe) idDevice: string,
    @Param('id') id: string,
    @Body() updateIncidentDto: UpdateIncidentDto) {
    return this.incidentService.updateStatusGim(+id, updateIncidentDto);
  }

  @ApiOperation({ summary: 'Upload an incident evidence file to Alfresco (multipart form-data, key: file)' })
  @Post('upload-alfresco/:userId/:idDevice')
  @UseInterceptors(FileInterceptor('file')) // 'file' debe coincidir con el FormData
  uploadAlfresco(
    @Param('userId', ParseIntPipe) userId: number,
    @Param('idDevice', ParseUUIDPipe) idDevice: string,
    @UploadedFile() file: any,
  ) {
    if (!file) {
      throw new BadRequestException('Debe enviar el archivo en form-data con key: file');
    }

    // Multer siempre envía estas propiedades
    const { buffer, originalname } = file;

    return this.incidentService.uploadToAlfresco(buffer, originalname);
  }

  @ApiOperation({ summary: 'Get a download URL for an Alfresco-stored file by alfrescoId' })
  @Get('get-file-url-alfresco/:userId/:idDevice/:alfrescoId')
  getFileUrlAlfresco(
    @Param('userId', ParseIntPipe) userId: number,
    @Param('idDevice', ParseUUIDPipe) idDevice: string,
    @Param('alfrescoId') alfrescoId: string,
  ) {
    if (!alfrescoId) {
      throw new BadRequestException('Debe enviar el alfrescoId');
    }

    return this.incidentService.getFileUrlAlfresco(alfrescoId);
  }

  @ApiOperation({ summary: 'Delete an incident by id' })
  // @AuthWithKeycloak()
  @Delete('remove/:userId/:idDevice/:id')
  remove(
    @GetUser() user: JwtPayload,
    @Param('userId', ParseIntPipe) userId: number,
    @Param('idDevice', ParseUUIDPipe) idDevice: string,
    @Param('id') id: string) {
    return this.incidentService.remove(+id);
  }

  @ApiOperation({ summary: 'Aggregate incident statistics by date range and filters' })
  // @AuthWithKeycloak()
  @Get('find-statistics/:userId/:idDevice/:version')
  findStatistics(
    @Query() filterDto: FilterDto,
    @Param('userId', ParseIntPipe) userId: number,
    @Param('idDevice', ParseUUIDPipe) idDevice: string,
    @Param('version', ParseIntPipe) version: number
  ) {
    return this.incidentService.findStatistics(filterDto);
  }

  @ApiOperation({ summary: 'List fractions that have sanctions, with optional filters' })
  @Get('find-all-fraction-sanction/:userId/:idDevice/:version')
  findAllFractionSanction(
    @Query() filterDto: FilterDto,
    @Param('userId', ParseIntPipe) userId: number,
    @Param('idDevice', ParseUUIDPipe) idDevice: string,
    @Param('version', ParseIntPipe) version: number
  ) {
    return this.incidentService.findAllFractionSanction(filterDto);
  }

  @ApiOperation({ summary: 'Incident statistics grouped by fraction' })
  // @AuthWithKeycloak()
  @Get('find-statistics-by-fraction/:userId/:idDevice/:version')
  findStatisticsByFraction(
    @Query() filterDto: FilterDto,
    @Param('userId', ParseIntPipe) userId: number,
    @Param('idDevice', ParseUUIDPipe) idDevice: string,
    @Param('version', ParseIntPipe) version: number
  ) {
    return this.incidentService.findStatisticsByFraction(filterDto);
  }

  @ApiOperation({ summary: 'Count total fractions with sanctions matching filters' })
  // @AuthWithKeycloak()
  @Get('find-all-fraction-sanction-total/:userId/:idDevice/:version')
  findAllFractionSanctionTotal(
    @Query() filterDto: FilterDto,
    @Param('userId', ParseIntPipe) userId: number,
    @Param('idDevice', ParseUUIDPipe) idDevice: string,
    @Param('version', ParseIntPipe) version: number
  ) {
    return this.incidentService.findAllFractionSanctionTotal(filterDto);
  }

  @ApiOperation({ summary: 'Aggregate total parking time per vehicle/client from incident data' })
  @Get('find-all-total-vehicle-client-time/:userId/:idDevice/:version')
  findAllTotalVehicleClientTime(
    @Query() filterDto: FilterDto,
    @Param('userId', ParseIntPipe) userId: number,
    @Param('idDevice', ParseUUIDPipe) idDevice: string,
    @Param('version', ParseIntPipe) version: number
  ) {
    return this.incidentService.findAllTotalVehicleClientTime(filterDto);
  }

  @ApiOperation({ summary: 'Full statistics combining fraction and sanction data' })
  // @AuthWithKeycloak()
  @Get('find-all-statistics-fraction-sanction/:userId/:idDevice/:version')
  findAllStatisticsFractionSanction(
    @Query() filterDto: FilterDto,
    @Param('userId', ParseIntPipe) userId: number,
    @Param('idDevice', ParseUUIDPipe) idDevice: string,
    @Param('version', ParseIntPipe) version: number
  ) {
    return this.incidentService.findAllStatisticsFractionSanction(filterDto);
  }

  @ApiOperation({ summary: 'Find pending incidents and synchronize/emit them to GIM' })
  // @AuthWithKeycloak()
  @Patch('find-and-sincronize-to-emit/:userId/:idDevice/:isTransacional/:version')
  findAndSincronizeToEmit(
    @GetUser() user: JwtPayload,
    @Param('userId', ParseIntPipe) userId: number,
    @Param('idDevice', ParseUUIDPipe) idDevice: string,
    @Param('isTransacional', ParseIntPipe) isTransacional: number,
    @Param('version', ParseIntPipe) version: number,
    @Body() filterDto: IncidentFilterDto) {
    return this.incidentService.findAndSincronizeToEmit(userId, idDevice, filterDto, isTransacional);
  }

  @ApiOperation({ summary: 'List incident notifications with optional filters' })
  @Get('find-all-notification/:userId/:idDevice/:version')
  findAllNotification(
    @Param('userId', ParseIntPipe) userId: number,
    @Param('idDevice', ParseUUIDPipe) idDevice: string,
    @Param('version', ParseIntPipe) version: number,
    @Query() filterDto: IncidentFilterDto) {
    return this.incidentService.findAllNotification(filterDto);
  }

  @ApiOperation({ summary: 'Advance incident to next workflow step (isTransacional=1 for transactional mode)' })
  // @AuthWithKeycloak()
  @Patch('advance-next-process/:userId/:idDevice/:isTransacional/:version')
  advanceNextProcess(
    @GetUser() user: JwtPayload,
    @Param('userId', ParseIntPipe) userId: number,
    @Param('idDevice', ParseUUIDPipe) idDevice: string,
    @Param('isTransacional', ParseIntPipe) isTransacional: number,
    @Param('version', ParseIntPipe) version: number,
    @Body() incidentDto: IncidentDto) {
    return this.incidentService.advanceNextProcess(userId, idDevice, incidentDto, isTransacional);
  }

}
