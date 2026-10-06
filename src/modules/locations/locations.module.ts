import { Module } from '@nestjs/common';
import { GeoService } from './geo.service';
import { ZonesService } from './zones.service';
import { ZonesController } from './zones.controller';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuditModule],
  controllers: [ZonesController],
  providers: [GeoService, ZonesService],
  exports: [GeoService, ZonesService],
})
export class LocationsModule {}
