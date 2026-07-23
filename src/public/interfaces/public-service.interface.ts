import { PublicFilterDto } from '../dto/public-filter.dto';

/**
 * Contract for the public read-only parking data service.
 *
 * Every method performs SELECT-only queries and never mutates state.
 */
export interface IPublicService {
    /** Returns all active zones with basic display information. */
    findAllZones(filter: PublicFilterDto): Promise<ZoneListResponse>;

    /** Returns a single zone with its sectors summary. */
    findZoneById(id: number): Promise<ZoneDetailResponse>;

    /** Returns all active sectors, optionally filtered by zone. */
    findAllSectors(filter: PublicFilterDto): Promise<SectorListResponse>;

    /** Returns a single sector with its schedules and slot counts. */
    findSectorById(id: number): Promise<SectorDetailResponse>;

    /** Returns schedules configured for a given sector. */
    findSchedulesBySector(sectorId: number): Promise<ScheduleListResponse>;

    /** Returns real-time slot availability for a single sector. */
    findSectorAvailability(
        sectorId: number,
    ): Promise<SectorAvailabilityResponse>;

    /** Returns real-time availability consolidated by zone. */
    findZoneAvailability(zoneId: number): Promise<ZoneAvailabilityResponse>;

    /** Returns a general occupancy summary across all zones. */
    findOccupancySummary(): Promise<OccupancySummaryResponse>;

    /** Returns map-optimized zone and sector data with geofences. */
    findMapData(filter: PublicFilterDto): Promise<MapDataResponse>;
}

/** Response for zone listing. */
export interface ZoneListResponse {
    zones: ZoneListItem[];
    total: number;
}

/** A single zone in a list response. */
export interface ZoneListItem {
    id: number;
    name: string;
    acronym: string;
    color: string;
    lt: number;
    lg: number;
    type: number;
    isActivated: boolean;
}

/** Response for a single zone with sector summary. */
export interface ZoneDetailResponse {
    zone: ZoneDetailItem | null;
}

/** Full zone detail including sector count and availability. */
export interface ZoneDetailItem extends ZoneListItem {
    description: string;
    totalSectors: number;
    totalSlots: number;
    availableSlots: number;
    occupiedSlots: number;
}

/** Response for sector listing. */
export interface SectorListResponse {
    sectors: SectorListItem[];
    total: number;
}

/** A single sector in a list response. */
export interface SectorListItem {
    id: number;
    name: string;
    acronym: string;
    color: string;
    lt: number;
    lg: number;
    priority: number;
    neighborhood: string;
    mainStreet: string;
    sideStreet: string;
    timeLimit: string;
    timeGrace: string;
    timePerFraction: string;
    isActivated: boolean;
    zoneId: number;
    zoneName: string;
}

/** Response for a single sector with full detail. */
export interface SectorDetailResponse {
    sector: SectorDetailItem | null;
}

/** Full sector detail including slot counts and schedules. */
export interface SectorDetailItem extends SectorListItem {
    description: string;
    totalSlots: number;
    availableSlots: number;
    occupiedSlots: number;
    schedules: ScheduleItem[];
}

/** Response for schedule listing. */
export interface ScheduleListResponse {
    schedules: ScheduleItem[];
}

/** A single schedule entry. */
export interface ScheduleItem {
    id: number;
    isActivated: boolean;
    dayOfWeekInit: number;
    dayOfWeekEnd: number;
    openingTime: string;
    closingTime: string;
}

/** Response for sector availability. */
export interface SectorAvailabilityResponse {
    sectorId: number;
    sectorName: string;
    totalSlots: number;
    available: number;
    occupied: number;
    exceeded: number;
    graceTime: number;
    outOfService: number;
    pcd: number;
}

/** Response for zone availability. */
export interface ZoneAvailabilityResponse {
    zoneId: number;
    zoneName: string;
    totalSlots: number;
    available: number;
    occupied: number;
    exceeded: number;
    graceTime: number;
    outOfService: number;
    pcd: number;
    sectors: SectorAvailabilitySummary[];
}

/** Availability per sector within a zone. */
export interface SectorAvailabilitySummary {
    sectorId: number;
    sectorName: string;
    totalSlots: number;
    available: number;
    occupied: number;
}

/** Response for the general occupancy summary. */
export interface OccupancySummaryResponse {
    totalZones: number;
    totalSectors: number;
    totalSlots: number;
    available: number;
    occupied: number;
    exceeded: number;
    graceTime: number;
    outOfService: number;
    pcd: number;
    occupancyRate: number;
    zones: ZoneOccupancySummary[];
}

/** Occupancy summary per zone. */
export interface ZoneOccupancySummary {
    zoneId: number;
    zoneName: string;
    totalSlots: number;
    available: number;
    occupied: number;
    occupancyRate: number;
}

/** Response for map-optimized data. */
export interface MapDataResponse {
    zones: MapZoneItem[];
}

/** Zone data optimized for map rendering. */
export interface MapZoneItem {
    id: number;
    name: string;
    acronym: string;
    color: string;
    lt: number;
    lg: number;
    geofence: any;
    sectors: MapSectorItem[];
}

/** Sector data optimized for map rendering. */
export interface MapSectorItem {
    id: number;
    name: string;
    acronym: string;
    color: string;
    lt: number;
    lg: number;
    geofence: any;
    totalSlots: number;
    availableSlots: number;
}
