import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { AuditService } from './audit.service';
import { QueryAuditLogsDto } from './dto/query-audit-logs.dto';
import { Roles } from '../../common/decorators/roles.decorator';

@ApiTags('Audit Logs')
@ApiBearerAuth('JWT-auth')
@Controller('audit')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'View Audit Logs (Admin only)',
    description: 'Retrieve chronological append-only audit trail of sensitive system actions with state diffs.',
  })
  @ApiResponse({ status: 200, description: 'Paginated audit logs' })
  @ApiResponse({ status: 403, description: 'Forbidden - requires ADMIN role' })
  async getAuditLogs(@Query() query: QueryAuditLogsDto) {
    return this.auditService.queryLogs(query);
  }
}
