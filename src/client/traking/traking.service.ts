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

  /**
   * Creates the tracking service.
   * @param locationRepository Repository for the `L` real-time location buffer entity.
   * @param dataSource TypeORM data source bound to the `tracking_controller` connection.
   */
  constructor(
    @InjectRepository(L)
    private readonly locationRepository: Repository<L>,

    @InjectDataSource('tracking_controller')
    private readonly dataSource: DataSource,
  ) {}

  private tableTracking = '';
  private tableJob = '';

  /**
   * Monthly partitions already verified to expose the zoneId/blockId columns
   * during this process lifetime. Avoids re-issuing the (locking) ALTER on
   * every read/write once a partition is known to be in sync.
   */
  private readonly tablesWithGeoColumns = new Set<string>();

  /**
   * Persists a single tracking sample into the current month's
   * `YYYY_MM_traking` partition, creating the partition and ensuring its geo
   * columns on first use. Errors are logged and swallowed so ingestion never
   * fails the caller.
   * @param vehicleId Identifier of the tracked vehicle.
   * @param userId Identifier of the controller/user being tracked.
   * @param idDevice Device identifier; only the substring [30, 36) is stored.
   * @param latitude Latitude of the sample.
   * @param longitude Longitude of the sample.
   * @param altitude Altitude of the sample.
   * @param statusTracking Tracking status of the sample.
   * @param activityTracking Detected activity associated with the sample.
   * @param speed Speed reported at the sample.
   * @param accuracy Location accuracy reported at the sample.
   * @param heading Heading/direction reported at the sample.
   * @param data Additional metadata object serialized as JSON.
   * @param polyline Encoded polyline associated with the sample.
   * @param zoneId Identifier of the zone the sample belongs to.
   * @param blockId Identifier of the block the sample belongs to.
   */
  private async _registerTraking(
    vehicleId: number,
    userId: number,
    idDevice: string,
    latitude: number,
    longitude: number,
    altitude: number,
    statusTracking: StatusTracking,
    activityTracking: ActivityTracking,
    speed: number,
    accuracy: number,
    heading: number,
    data: object,
    polyline: string,
    zoneId: number,
    blockId: number,
  ) {
    const register: Date = new Date();
    const year = register.getUTCFullYear();
    const month = register.getUTCMonth() + 1;

    try {
      const schema = 'public';
      let table = `${year}_${month <= 9 ? `0${month}` : month}_traking`;
      table = `"${table}"`;
      table = `${schema}.${table}`;

      if (table !== this.tableTracking) {
        await this.dataSource.query(
          ` CREATE TABLE IF NOT EXISTS ${table} (LIKE ${schema}."traking" INCLUDING ALL) `,
        );
        this.tableTracking = table;
      }

      // Ensure the partition exposes the geo columns before inserting them.
      await this._ensureGeoColumns(table);

      const isoString = register.toISOString().split('T');
      const date = isoString[0];
      const time = isoString[1].substring(0, 8);

      await this.dataSource.query(
        `
        INSERT INTO ${table}
          ( register, "userId", time, "vehicleId", "idDevice", latitude, longitude, altitude, speed, accuracy, heading, "statusTracking", "activityTracking", data, polyline, "zoneId", "blockId" )
        VALUES
          ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
        ON CONFLICT DO NOTHING;
  `,
        [
          date,
          userId,
          time,
          vehicleId,
          idDevice ? idDevice.substring(30, 36) : '',
          latitude,
          longitude,
          altitude,
          speed,
          accuracy,
          heading,
          statusTracking,
          activityTracking,
          JSON.stringify(data),
          polyline,
          zoneId,
          blockId,
        ],
      );
    } catch (err) {
      this.logger.error(`Call _register err: ${err}`);
    }
  }

  /**
   * Backfills the geo columns (`zoneId`, `blockId`) on a monthly tracking
   * partition. Partitions created from the `traking` template before these
   * columns existed lack them, which breaks both INSERTs (writes) and the
   * SELECTs that surface zone/sector in the history endpoints.
   *
   * `ADD COLUMN IF NOT EXISTS` is idempotent and a per-process cache prevents
   * re-running the statement (and taking its brief table lock) once a given
   * partition is known to be in sync.
   * @param table Fully-qualified, quoted partition name (e.g. `public."2026_06_traking"`).
   */
  private async _ensureGeoColumns(table: string): Promise<void> {
    if (this.tablesWithGeoColumns.has(table)) return;

    await this.dataSource.query(
      `ALTER TABLE ${table}
         ADD COLUMN IF NOT EXISTS "zoneId" integer,
         ADD COLUMN IF NOT EXISTS "blockId" integer`,
    );
    this.tablesWithGeoColumns.add(table);
  }

  /**
   * Upserts the user's latest real-time location in the `L` buffer (UPDATE
   * first, INSERT if no row exists) and forwards the sample to the historical
   * tracking partition. Returns early when no payload is present.
   * @param userId Identifier of the user whose location is being plotted.
   * @param plotLocationDto Payload carrying the encoded position (`p`), polyline (`l`), travels (`t`), zone and block.
   * @returns `true` once processing completes, or `undefined` when there is no payload to plot.
   */
  async plot(userId: number, plotLocationDto: PlotLocationDto) {
    const { p, l: polyline, t: travels, zoneId, blockId } = plotLocationDto;

    if (!p) return;

    try {
      const [
        ,
        version,
        _distanceOnline, // do not remove
        _distanceOfline, // do not remove
        vehicleId,
        latitude,
        longitude,
        altitude,
        speed,
        accuracy,
        heading,
        statusTracking,
        activityTracking,
        taken,
        gps,
        battery,
        carrier,
        network,
        platform,
        versionos,
        typeconnection,
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
        [
          latitude,
          longitude,
          heading,
          taken,
          polyline,
          zoneId,
          blockId,
          userId,
        ],
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
          [
            userId,
            latitude,
            longitude,
            heading,
            taken,
            polyline,
            zoneId,
            blockId,
          ],
        );
      }

      const data = {
        travels,
        meta: [
          gps,
          battery,
          carrier,
          network,
          version,
          platform,
          versionos,
          typeconnection,
        ],
      };
      this._registerTraking(
        vehicleId,
        userId,
        null,
        latitude,
        longitude,
        altitude,
        statusTracking,
        activityTracking,
        speed,
        accuracy,
        heading,
        data,
        polyline,
        zoneId,
        blockId,
      );
    } catch {
      this.logger.error(`Call plot`);
    }

    return true;
  }

  /**
   * Retrieves all tracking records for a user within a date range, querying the
   * relevant monthly partition(s). When the range spans two days it runs two
   * queries and merges the results; otherwise a single partition query is used.
   * @param userId Identifier of the user whose tracking records are requested.
   * @param from Start date/time of the range (inclusive).
   * @param to End date/time of the range (inclusive).
   * @returns Object with the `errorCode` and the list of `trackings` found.
   */
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

      const queryFrom = `
          SELECT "idDevice", latitude, longitude, "statusTracking", "activityTracking", data, polyline, register, time FROM public.${tableFrom} t 
          WHERE t.register = $1 AND t."userId" = $2 AND time BETWEEN  $3 AND '23:59:59';
      `;
      const resultFrom = await this.dataSource.query(queryFrom, [
        dateFrom,
        userId,
        timeFrom,
      ]);

      const isoStringTo = to.toISOString().split('T');
      const dateTo = isoStringTo[0];
      const timeTo = isoStringTo[1].substring(0, 8);

      const yearTo = to.getFullYear();
      const monthTo = from.getMonth() + 1;
      const tableTo = `"${yearTo}_${monthTo <= 9 ? `0${monthTo}` : monthTo}_traking"`;

      const queryTo = `
        SELECT "idDevice", latitude, longitude, "statusTracking", "activityTracking", data, polyline, register, time FROM public.${tableTo} t 
        WHERE t.register = $1 AND t."userId" = $2 AND time BETWEEN  $3 AND '23:59:59';
    `;
      const resultTo = await this.dataSource.query(queryTo, [
        dateTo,
        userId,
        timeTo,
      ]);
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

      const query = `
        SELECT "idDevice", latitude, longitude, "statusTracking", "activityTracking", data, polyline, register, time FROM public.${tableFrom} t 
        WHERE t.register = $1 AND t."userId" = $2 AND time BETWEEN  $3 AND $4;
    `;
      const result = await this.dataSource.query(query, [
        dateFrom,
        userId,
        timeFrom,
        timeTo,
      ]);

      trackings = result;
    }

    return { errorCode: ErrorCode.NONE, trackings };
  }

  /**
   * Returns the user's most recent location from the `L` buffer, formatted for
   * the map client (latitude, longitude, direction, date and polyline).
   * @param userId Identifier of the user whose latest location is requested.
   * @returns Object with `errorCode` set to `NOT_FOUND` when no location exists, otherwise the latest location data.
   */
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

  /**
   * Returns the latest buffered location for each user in a comma-separated
   * list of user identifiers.
   * @param userIds Comma-separated list of user identifiers to look up.
   * @returns Object with the `errorCode` and the list of `locations` found.
   */
  async getTrackings(userIds: string) {
    const userIdArray = userIds.split(',').map((id) => Number(id));

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
   * @param userId Identifier of the user whose history is requested.
   * @param from Start date/time of the range (inclusive).
   * @param to End date/time of the range (inclusive).
   * @param year Year of the target partition.
   * @param month Month (1-12) of the target partition.
   * @param limit Optional maximum number of rows to return (enables pagination).
   * @param offset Optional row offset used when paginating.
   * @returns Object with the `errorCode`, the page of `trackings` and the `total` row count.
   */
  async getAllTrackingHistory(
    userId: number,
    from: Date,
    to: Date,
    year: number,
    month: number,
    limit?: number,
    offset?: number,
  ) {
    const paddedMonth = month <= 9 ? `0${month}` : `${month}`;
    const tableName = `${year}_${paddedMonth}_traking`;
    const qualifiedTable = `public."${tableName}"`;

    // The partition is created lazily on first INSERT. If a user queries a
    // month with no tracking data the table won't exist; return [] instead
    // of throwing a SQL error.
    const tableExists = await this.dataSource.query(
      `SELECT to_regclass($1) AS oid`,
      [qualifiedTable],
    );
    if (!tableExists?.[0]?.oid) {
      return { errorCode: ErrorCode.NONE, trackings: [], total: 0 };
    }

    // Partitions created before zoneId/blockId existed lack those columns;
    // ensure them so the SELECT below can return zone/sector consistently.
    await this._ensureGeoColumns(qualifiedTable);

    const isoFrom = from.toISOString().split('T');
    const dateFrom = isoFrom[0];
    const timeFrom = isoFrom[1].substring(0, 8);

    const isoTo = to.toISOString().split('T');
    const dateTo = isoTo[0];
    const timeTo = isoTo[1].substring(0, 8);

    const hasPagination = limit !== undefined && limit !== null && limit > 0;

    // NOTE: `block`/`zone` live in the default `simert` database while these
    // partitions live in the `tracking_controller` database. PostgreSQL cannot
    // JOIN across databases, so we query the partition alone here and resolve
    // the block/zone names afterwards via `_attachZoneAndBlockNames` (which runs
    // on the default connection). Counting without the join also keeps `total`
    // consistent with the rows actually returned.

    // Total count for pagination metadata. Only run COUNT(*) when paginating
    // — for non-paginated callers we can derive it from the result length.
    let total = 0;
    if (hasPagination) {
      const countRow = await this.dataSource.query(
        `
          SELECT COUNT(*)::int AS total
          FROM ${qualifiedTable} t
          WHERE t."userId" = $1
          AND t.register BETWEEN $2 AND $3
          AND (t.register <> $2 OR t.time >= $4)
          AND (t.register <> $3 OR t.time <= $5);
        `,
        [userId, dateFrom, dateTo, timeFrom, timeTo],
      );
      total = countRow?.[0]?.total ?? 0;
    }

    const dataParams: any[] = [userId, dateFrom, dateTo, timeFrom, timeTo];
    let pagingClause = '';
    if (hasPagination) {
      dataParams.push(limit, offset ?? 0);
      pagingClause = `LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}`;
    }

    const query = `
        SELECT "idDevice", latitude, longitude, "statusTracking", "activityTracking",
               data, polyline, register, time, "zoneId", "blockId"
        FROM ${qualifiedTable} t
        WHERE t."userId" = $1
          AND t.register BETWEEN $2 AND $3
          AND (t.register <> $2 OR t.time >= $4)
          AND (t.register <> $3 OR t.time <= $5)
        ORDER BY t.register DESC, t.time DESC
        ${pagingClause};
      `;
    const trackings = await this.dataSource.query(query, dataParams);

    if (!hasPagination) total = trackings.length;

    // Resolve blockName/zoneName from the default database and merge in memory.
    await this._attachZoneAndBlockNames(trackings);

    return { errorCode: ErrorCode.NONE, trackings, total };
  }

  /**
   * Enriches tracking rows in place with their `blockName` and `zoneName`.
   *
   * The tracking partitions live in the `tracking_controller` database, whereas
   * `block`/`zone` live in the default `simert` database, so PostgreSQL cannot
   * JOIN them directly. Names are resolved with a single query on the default
   * connection (the same one backing the `L` repository) and merged by
   * `blockId`. Rows whose `blockId` is null or no longer references an existing
   * block keep `null` names instead of being dropped (LEFT-join semantics),
   * preserving historical samples captured before geo data was sent.
   * @param trackings Tracking rows carrying numeric `blockId`/`zoneId`; mutated to add `blockName`/`zoneName`.
   */
  private async _attachZoneAndBlockNames(trackings: any[]): Promise<void> {
    if (!trackings?.length) return;

    const blockIds = [
      ...new Set(
        trackings
          .map((tracking) => tracking.blockId)
          .filter((id) => id !== null && id !== undefined),
      ),
    ];

    const namesByBlockId = new Map<
      number,
      { blockName: string; zoneName: string }
    >();

    if (blockIds.length) {
      // `zoneName` is derived through the block's zone (block.zoneId -> zone.id),
      // matching the original join semantics. Runs on the default `simert` DB.
      const rows: Array<{
        blockId: number;
        blockName: string;
        zoneName: string;
      }> = await this.locationRepository.query(
        `
          SELECT b.id AS "blockId", b.name AS "blockName", z.name AS "zoneName"
          FROM public.block b
          INNER JOIN public.zone z ON b."zoneId" = z.id
          WHERE b.id = ANY($1::int[])
        `,
        [blockIds],
      );

      for (const row of rows) {
        namesByBlockId.set(row.blockId, {
          blockName: row.blockName,
          zoneName: row.zoneName,
        });
      }
    }

    for (const tracking of trackings) {
      const names = namesByBlockId.get(tracking.blockId);
      tracking.blockName = names?.blockName ?? null;
      tracking.zoneName = names?.zoneName ?? null;
    }
  }

  /**
   * Returns a downsampled lat/lng list for the user's tracking inside a
   * single monthly partition. Designed to feed the Histórico map polyline
   * without freezing the browser when the raw record count is huge.
   *
   * Strategy:
   *   1. Resolve year/month/dateFrom/dateTo/timeFrom/timeTo as in
   *      `getAllTrackingHistory`.
   *   2. COUNT(*) over the same predicate to get the total point count.
   *   3. If total <= maxPoints, return everything (ordered chronologically).
   *   4. Otherwise compute `stride = ceil(total / maxPoints)` and keep only
   *      rows where `row_number % stride = 0`, plus the first and last
   *      rows so the visible route always starts and ends at the real
   *      endpoints.
   *
   * The default cap of 1500 points keeps Leaflet's SVG renderer fluid even
   * on lower-end devices; callers can raise/lower it via `maxPoints`.
   * @param userId Identifier of the user whose polyline is requested.
   * @param from Start date/time of the range (inclusive).
   * @param to End date/time of the range (inclusive).
   * @param year Year of the target partition.
   * @param month Month (1-12) of the target partition.
   * @param maxPoints Maximum number of points to return; results are downsampled when exceeded.
   * @returns Object with the `errorCode`, the (possibly downsampled) `points` and the `total` row count.
   */
  async getTrackingPolyline(
    userId: number,
    from: Date,
    to: Date,
    year: number,
    month: number,
    maxPoints = 1500,
  ) {
    const paddedMonth = month <= 9 ? `0${month}` : `${month}`;
    const tableName = `${year}_${paddedMonth}_traking`;
    const qualifiedTable = `public."${tableName}"`;

    const tableExists = await this.dataSource.query(
      `SELECT to_regclass($1) AS oid`,
      [qualifiedTable],
    );
    if (!tableExists?.[0]?.oid) {
      return { errorCode: ErrorCode.NONE, points: [], total: 0 };
    }

    const isoFrom = from.toISOString().split('T');
    const dateFrom = isoFrom[0];
    const timeFrom = isoFrom[1].substring(0, 8);

    const isoTo = to.toISOString().split('T');
    const dateTo = isoTo[0];
    const timeTo = isoTo[1].substring(0, 8);

    const countRow = await this.dataSource.query(
      `
        SELECT COUNT(*)::int AS total
        FROM ${qualifiedTable} t
        WHERE t."userId" = $1
          AND t.register BETWEEN $2 AND $3
          AND (t.register <> $2 OR t.time >= $4)
          AND (t.register <> $3 OR t.time <= $5);
      `,
      [userId, dateFrom, dateTo, timeFrom, timeTo],
    );
    const total: number = countRow?.[0]?.total ?? 0;
    if (total === 0) {
      return { errorCode: ErrorCode.NONE, points: [], total: 0 };
    }

    const safeMax = Math.max(2, Math.floor(maxPoints) || 1500);

    // Under the cap → return every point, just lat/lng.
    if (total <= safeMax) {
      const points = await this.dataSource.query(
        `
          SELECT latitude, longitude
          FROM ${qualifiedTable} t
          WHERE t."userId" = $1
            AND t.register BETWEEN $2 AND $3
            AND (t.register <> $2 OR t.time >= $4)
            AND (t.register <> $3 OR t.time <= $5)
          ORDER BY t.register, t.time;
        `,
        [userId, dateFrom, dateTo, timeFrom, timeTo],
      );
      return { errorCode: ErrorCode.NONE, points, total };
    }

    // Above the cap → stride sampling, preserving endpoints.
    const stride = Math.ceil(total / safeMax);
    const points = await this.dataSource.query(
      `
        WITH ordered AS (
          SELECT latitude, longitude,
                 ROW_NUMBER() OVER (ORDER BY t.register, t.time) AS rn
          FROM ${qualifiedTable} t
          WHERE t."userId" = $1
            AND t.register BETWEEN $2 AND $3
            AND (t.register <> $2 OR t.time >= $4)
            AND (t.register <> $3 OR t.time <= $5)
        )
        SELECT latitude, longitude
        FROM ordered
        WHERE rn = 1 OR rn = $6 OR (rn % $7) = 0
        ORDER BY rn;
      `,
      [userId, dateFrom, dateTo, timeFrom, timeTo, total, stride],
    );

    return { errorCode: ErrorCode.NONE, points, total };
  }
}
