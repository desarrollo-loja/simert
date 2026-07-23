import { IsNumber } from 'class-validator';
import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

/**
 *
 */
@Entity({
    name: 'l',
    comment:
        'High-write real-time location tracking buffer using flat numeric ids (userId, zoneId, blockId) with no foreign keys by design',
})
@Index('idxLUserIdTakenTimestampLatitudeLongitude', [
    'userId',
    'taken',
    'timestamp',
    'latitude',
    'longitude',
])
export class L {
    @PrimaryColumn({
        primaryKeyConstraintName: 'pkLId',
        comment:
            'User identifier, used as primary key for real-time location tracking',
    })
    @IsNumber()
    userId: number;

    @Column('smallint', {
        default: 0,
        comment:
            'Flag indicating whether the location has been consumed/processed (0=available, 1=taken)',
    })
    @Index('idxLTaken')
    taken: number;

    // Latitude: represents the north-south position of a point on Earth
    @Column({
        default: 0,
        type: 'decimal',
        precision: 10,
        scale: 6,
        comment: 'Latitude coordinate of the user current position',
    })
    latitude: number;

    // Longitude: represents the east-west position of a point on Earth
    @Column({
        default: 0,
        type: 'decimal',
        precision: 10,
        scale: 6,
        comment: 'Longitude coordinate of the user current position',
    })
    longitude: number;

    // Zone the user current position falls into (references Zone.id)
    @Column('int', {
        default: null,
        nullable: true,
        comment:
            'Identifier of the zone the user current position falls into (references Zone.id, null when outside any zone or not yet computed for existing tracking rows)',
    })
    @Index('idxLZoneId')
    zoneId: number;

    // Block (sector) the user current position falls into (references Block.id)
    @Column('int', {
        default: null,
        nullable: true,
        comment:
            'Identifier of the block/sector the user current position falls into (references Block.id, null when outside any block or not yet computed for existing tracking rows)',
    })
    @Index('idxLBlockId')
    blockId: number;

    // Heading: direction the device is moving, in degrees (0-360)
    @Column({
        default: 0,
        type: 'decimal',
        precision: 10,
        scale: 2,
        comment: 'Direction of movement in degrees (0-360, where 0=North)',
    })
    heading: number;

    @Column({
        type: 'text',
        comment:
            'Encoded polyline string representing the recent movement path of the user',
    })
    polyline: string;

    @Column({
        type: 'timestamp',
        default: () => 'now()',
        comment: 'Timestamp when this location snapshot was recorded',
    })
    timestamp: Date;
}
