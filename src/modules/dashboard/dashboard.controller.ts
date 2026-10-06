import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { DashboardService } from './dashboard.service';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import {
  AdminDashboardStatsDto,
  SecurityDashboardStatsDto,
  ResidentDashboardStatsDto,
} from './dto/dashboard-stats.dto';

@ApiTags('Dashboard')
@ApiBearerAuth('JWT-auth')
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('admin')
  @Roles('ADMIN')
  @ApiOperation({
    summary: 'System Administrator Dashboard',
    description: 'Returns system-wide user counts, zone stats, alert blast totals, and platform health.',
  })
  @ApiResponse({ status: 200, type: AdminDashboardStatsDto })
  async getAdminDashboard(): Promise<AdminDashboardStatsDto> {
    return this.dashboardService.getAdminStats();
  }

  @Get('security')
  @Roles('SECURITY', 'ADMIN')
  @ApiOperation({
    summary: 'Security Operations Command Dashboard',
    description: 'Returns tactical incident queue status, pending verification counters, and active alert progress.',
  })
  @ApiResponse({ status: 200, type: SecurityDashboardStatsDto })
  async getSecurityDashboard(): Promise<SecurityDashboardStatsDto> {
    return this.dashboardService.getSecurityStats();
  }

  @Get('resident')
  @Roles('RESIDENT', 'SECURITY', 'ADMIN')
  @ApiOperation({
    summary: 'Community Resident Safety Portal',
    description: 'Returns resident zone status, recent localized alerts, and notification preferences.',
  })
  @ApiResponse({ status: 200, type: ResidentDashboardStatsDto })
  async getResidentDashboard(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ResidentDashboardStatsDto> {
    return this.dashboardService.getResidentStats(user.id);
  }

  @Get('summary')
  @ApiOperation({
    summary: 'Adaptive Role-Based Dashboard Dispatcher',
    description: 'Automatically detects authenticated user role and routes to the appropriate dashboard data.',
  })
  async getDashboardSummary(@CurrentUser() user: AuthenticatedUser) {
    if (user?.role === 'ADMIN') {
      return {
        role: 'ADMIN',
        dashboardType: 'governance',
        stats: await this.dashboardService.getAdminStats(),
      };
    }

    if (user?.role === 'SECURITY') {
      return {
        role: 'SECURITY',
        dashboardType: 'tactical_dispatch',
        stats: await this.dashboardService.getSecurityStats(),
      };
    }

    return {
      role: 'RESIDENT',
      dashboardType: 'community_safety',
      stats: await this.dashboardService.getResidentStats(user?.id || ''),
    };
  }
}
