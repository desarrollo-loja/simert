import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { L } from 'src/admin/l/entities/l.entity';
import { ErrorCode } from 'src/common/glob/error';
import { ActivityTracking } from 'src/common/glob/status/activity_traking';
import { StatusTracking } from 'src/common/glob/status/status_tracking';
import { DataSource, Repository } from 'typeorm';

import { PlotLocationDto } from './dto/plot-location.dto';

/**
 * Service for ingesting and querying real-time controller location
 * tracking. Writes to the high-throughput `L` buffer (numeric IDs,
 * no FKs by design — see project docs) and reads from the partitioned
 * historical tracking tables for date-range searches.
 */
@Injectable()
export class TrakingService {

  private readonly logger = new Logger('TrakingService');

  constructor(

    @InjectRepository(L)
    private readonly locationRepository: Repository<L>,

    @InjectDataSource('tracking_controller')
    private readonly dataSource: DataSource
  ) { }

  private tableTracking = '';
  private tableJob = '';

  private async _registerTraking(
    vehicleId: number, userId: number, idDevice: string, latitude: number, longitude: number, altitude: number,
    statusTracking: StatusTracking, activityTracking: ActivityTracking, speed: number, accuracy: number, heading: number, data: Object,
    polyline: string) {

    const register: Date = new Date();
    register.toISOString().substring
    const year = register.getUTCFullYear();
    const month = register.getUTCMonth() + 1;

    try {
      const schema = 'public';
      let table = `${year}_${month <= 9 ? `0${month}` : month}_traking`;
      table = `"${table}"`
      table = `${schema}.${table}`

      if (table !== this.tableTracking) {
        await this.dataSource.query(` CREATE TABLE IF NOT EXISTS ${table} (LIKE ${schema}."traking" INCLUDING ALL) `);
        this.tableTracking = table;
      }

      const isoString = register.toISOString().split('T');
      const date = isoString[0];
      const time = isoString[1].substring(0, 8);

      await this.dataSource.query(
        `
        INSERT INTO ${table}
          ( register, "userId", time, "vehicleId", "idDevice", latitude, longitude, altitude, speed, accuracy, heading, "statusTracking", "activityTracking", data, polyline )
        VALUES
          ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        ON CONFLICT DO NOTHING;
  `, [date, userId, time, vehicleId, idDevice ? idDevice.substring(30, 36) : '', latitude, longitude, altitude, speed, accuracy, heading, statusTracking, activityTracking, JSON.stringify(data), polyline]);

    } catch (err) {
      this.logger.error(`Call _register err: ${err}`);
    }
  }

  async plot(userId: number, plotLocationDto: PlotLocationDto) {

    const { p, l: polyline, t: travels, zoneId, blockId } = plotLocationDto;

    if (!p) return;

    try {

      const [
        , version
        , distanceOnline // do not remove
        , distanceOfline // do not remove
        , vehicleId
        , latitude
        , longitude
        , altitude
        , speed
        , accuracy
        , heading
        , statusTracking
        , activityTracking
        , taken
        , gps
        , battery
        , carrier
        , network
        , platform
        , versionos
        , typeconnection

      ]: any = p.split(',');

      // 1) Try UPDATE first
      const updateResult = await this.locationRepository.query(
        `
          UPDATE public.l
          SET
            latitude = $1,
            longitude = $2,
            heading = $3,
            taken = $4,
            polyline = $5,
            "zoneId" = $6,
            "blockId" = $7,
            "timestamp" = NOW()
          WHERE "userId" = $8
        `,
        [latitude, longitude, heading, taken, polyline, zoneId, blockId, userId]
      );

      // updateResult[1] is the affected rows count on MySQL
      if (updateResult[1] === 0) {
        this.logger.debug('No existing location found, inserting new record.');
        // 2) If it does not exist, INSERT
        await this.locationRepository.query(
          `
          INSERT INTO public.l
            ("userId", latitude, longitude, heading, taken, polyline, "zoneId", "blockId", "timestamp")
          VALUES
            ($1, $2, $3, $4, $5, $6, $7, $8, NOW());
          `,
          [userId, latitude, longitude, heading, taken, polyline, zoneId, blockId]
        );
      }

      const data = { travels, meta: [gps, battery, carrier, network, version, platform, versionos, typeconnection] };
      this._registerTraking(vehicleId, userId, null, latitude, longitude, altitude, statusTracking, activityTracking, speed, accuracy, heading, data, polyline);

    } catch (error) {
      this.logger.error(`Call plot`);
    }

    return true;
  }

  async getAllTracking(userId: number, from: Date, to: Date) {

    let trackings: any = [];

    // Run two queries (date range crosses partitions)
    if (from.getDate() !== to.getDate()) {

      const isoStringFrom = from.toISOString().split('T');
      const dateFrom = isoStringFrom[0];
      const timeFrom = isoStringFrom[1].substring(0, 8);
      const yearFrom = from.getFullYear();
      const monthFrom = from.getMonth() + 1;
      const tableFrom = `"${yearFrom}_${monthFrom <= 9 ? `0${monthFrom}` : monthFrom}_traking"`;

      const queryFrom =
        `
          SELECT "idDevice", latitude, longitude, "statusTracking", "activityTracking", data, polyline, register, time FROM public.${tableFrom} t 
          WHERE t.register = $1 AND t."userId" = $2 AND time BETWEEN  $3 AND '23:59:59';
      `
      const resultFrom = await this.dataSource.query(queryFrom, [dateFrom, userId, timeFrom]);

      const isoStringTo = to.toISOString().split('T');
      const dateTo = isoStringTo[0];
      const timeTo = isoStringTo[1].substring(0, 8);

      const yearTo = to.getFullYear();
      const monthTo = from.getMonth() + 1;
      const tableTo = `"${yearTo}_${monthTo <= 9 ? `0${monthTo}` : monthTo}_traking"`;

      const queryTo =
        `
        SELECT "idDevice", latitude, longitude, "statusTracking", "activityTracking", data, polyline, register, time FROM public.${tableTo} t 
        WHERE t.register = $1 AND t."userId" = $2 AND time BETWEEN  $3 AND '23:59:59';
    `
      const resultTo = await this.dataSource.query(queryTo, [dateTo, userId, timeTo]);
      trackings = [...resultFrom, ...resultTo];
    }
    // Single query — data lives in a single partition
    else {
      const isoStringFrom = from.toISOString().split('T');
      const dateFrom = isoStringFrom[0];
      const timeFrom = isoStringFrom[1].substring(0, 8);

      const isoStringTo = to.toISOString().split('T');
      const timeTo = isoStringTo[1].substring(0, 8);

      const yearFrom = from.getFullYear();
      const monthFrom = from.getMonth() + 1;
      const tableFrom = `"${yearFrom}_${monthFrom <= 9 ? `0${monthFrom}` : monthFrom}_traking"`;

      const query =
        `
        SELECT "idDevice", latitude, longitude, "statusTracking", "activityTracking", data, polyline, register, time FROM public.${tableFrom} t 
        WHERE t.register = $1 AND t."userId" = $2 AND time BETWEEN  $3 AND $4;
    `
      const result = await this.dataSource.query(query, [dateFrom, userId, timeFrom, timeTo]);

      trackings = result;
    }

    return { errorCode: ErrorCode.NONE, trackings };
  }

  async getTrackingByUserId(userId: number) {

    const query = `
    SELECT latitude, longitude, heading, timestamp, polyline 
    FROM simert.l 
    WHERE userId = ? 
    LIMIT 1;
  `;

    const locations: Array<{
      latitude: string | number;
      longitude: string | number;
      heading: string | number;
      timestamp: Date;
      polyline: string;
    }> = await this.locationRepository.query(query, [userId]);

    if (locations.length === 0) {
      return { errorCode: ErrorCode.NOT_FOUND };
    }

    const location = locations[0];

    return {
      errorCode: ErrorCode.NONE,
      lt: Number(location.latitude),
      lg: Number(location.longitude),
      direction: Number(location.heading),
      date: location.timestamp,
      spriteSheet: '',
      polyline: location.polyline,
    };
  }

  async getTrackings(userIds: string) {
    const userIdArray = userIds.split(',').map(id => Number(id));

    // Raw query (kept as-is from original implementation)
    const query = `
    SELECT userId, latitude, longitude, heading, polyline
    FROM simert.l
    WHERE userId IN (?)
  `;

    const locations: Array<{
      userId: number;
      latitude: string | number;
      longitude: string | number;
      heading: string | number;
      polyline: string | null;
    }> = await this.locationRepository.query(query, [userIdArray]);

    return { errorCode: ErrorCode.NONE, locations };
  }

  /**
   * Historical tracking lookup against a single monthly partition.
   *
   * The frontend's Histórico tab guarantees `from` and `to` live inside the
   * same month, and passes the year+month explicitly. We use them to route
   * directly to the `YYYY_MM_traking` table (no fallback / no UNION), and
   * apply the day-of-month + hour boundaries inside that partition:
   *   • register BETWEEN dateFrom AND dateTo (inclusive)
   *   • on the first day: time >= timeFrom
   *   • on the last  day: time <= timeTo
   *   • days in between: any time
   *
   * If the partition does not exist yet (e.g. queried for a month that
   * never had data), we return an empty result instead of crashing.
   */
  async getAllTrackingHistory(
    userId: number, from: Date, to: Date, year: number, month: number
  ) {
    const paddedMonth = month <= 9 ? `0${month}` : `${month}`;
    const tableName = `${year}_${paddedMonth}_traking`;
    const qualifiedTable = `public."${tableName}"`;

    // The partition is created lazily on first INSERT. If a user queries a
    // month with no tracking data the table won't exist; return [] instead
    // of throwing a SQL error.
    const tableExists = await this.dataSource.query(
      `SELECT to_regclass($1) AS oid`,
      [qualifiedTable]
    );
    if (!tableExists?.[0]?.oid) {
      return { errorCode: ErrorCode.NONE, trackings: [] };
    }

    const isoFrom = from.toISOString().split('T');
    const dateFrom = isoFrom[0];
    const timeFrom = isoFrom[1].substring(0, 8);

    const isoTo = to.toISOString().split('T');
    const dateTo = isoTo[0];
    const timeTo = isoTo[1].substring(0, 8);

    const query =
      `
        SELECT "idDevice", latitude, longitude, "statusTracking", "activityTracking",
               data, polyline, register, time
        FROM ${qualifiedTable} t
        WHERE t."userId" = $1
          AND t.register BETWEEN $2 AND $3
          AND (t.register <> $2 OR t.time >= $4)
          AND (t.register <> $3 OR t.time <= $5)
        ORDER BY t.register, t.time;
      `;
    const trackings = await this.dataSource.query(
      query,
      [userId, dateFrom, dateTo, timeFrom, timeTo]
    );

    return { errorCode: ErrorCode.NONE, trackings };
  }

}