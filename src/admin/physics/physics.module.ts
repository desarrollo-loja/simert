import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from 'src/auth/auth.module';

import { Physic } from './entities/physic.entity';
import { PhysicsController } from './physics.controller';
import { PhysicsService } from './physics.service';

/**
 *
 */
@Module({
    controllers: [PhysicsController],
    providers: [PhysicsService],
    imports: [TypeOrmModule.forFeature([Physic]), AuthModule],
})
export class PhysicsModule {}
