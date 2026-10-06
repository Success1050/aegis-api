import { Module } from '@nestjs/common';
import { IncidentsService } from './incidents.service';
import { IncidentsController } from './incidents.controller';
import { AutoExpiryService } from './auto-expiry.service';
import { LocationsModule } from '../locations/locations.module';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [LocationsModule, AuditModule],
  controllers: [IncidentsController],
  providers: [IncidentsService, AutoExpiryService],
  exports: [IncidentsService],
})
export class IncidentsModule {}
