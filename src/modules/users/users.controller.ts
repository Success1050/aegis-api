import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  Req,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { Request } from 'express';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserQueryDto } from './dto/user-query.dto';
import { BulkImportDto, BulkImportResponseDto } from './dto/bulk-import.dto';
import {
  PaginatedUserResponseDto,
  UserResponseDto,
} from './dto/user-response.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Users')
@ApiBearerAuth('JWT-auth')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @Roles('ADMIN', 'SECURITY')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Register a new community resident or security officer',
    description:
      'Supports Zone-based and GPS-enhanced registration. Automatically hashes credentials, sets alerts enabled by default, and dispatches login details with portal link.',
  })
  @ApiResponse({ status: 201, type: UserResponseDto })
  @ApiResponse({ status: 400, description: 'Validation error' })
  @ApiResponse({ status: 409, description: 'Phone or email already registered' })
  async createUser(
    @Body() dto: CreateUserDto,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Req() req: Request,
  ): Promise<UserResponseDto> {
    const ip = req.ip || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'];
    return this.usersService.createUser(dto, currentUser.id, ip, userAgent);
  }

  @Get()
  @Roles('ADMIN', 'SECURITY')
  @ApiOperation({ summary: 'Paginated user directory search with role and zone filters' })
  @ApiResponse({ status: 200, type: PaginatedUserResponseDto })
  async listUsers(@Query() query: UserQueryDto): Promise<PaginatedUserResponseDto> {
    return this.usersService.listUsers(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get user details by ID' })
  @ApiResponse({ status: 200, type: UserResponseDto })
  @ApiResponse({ status: 404, description: 'User not found' })
  async getUserById(@Param('id', ParseUUIDPipe) id: string): Promise<UserResponseDto> {
    return this.usersService.getUserById(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update user profile, coordinates, language or address' })
  @ApiResponse({ status: 200, type: UserResponseDto })
  @ApiResponse({ status: 404, description: 'User not found' })
  async updateUser(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Req() req: Request,
  ): Promise<UserResponseDto> {
    const ip = req.ip || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'];
    return this.usersService.updateUser(id, dto, currentUser.id, ip, userAgent);
  }

  @Delete(':id')
  @Roles('ADMIN')
  @ApiOperation({ summary: 'Soft-deactivate user account (Admin only)' })
  @ApiResponse({ status: 200, description: 'User deactivated' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async deactivateUser(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Req() req: Request,
  ): Promise<{ success: boolean; message: string }> {
    const ip = req.ip || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'];
    return this.usersService.deactivateUser(id, currentUser.id, ip, userAgent);
  }

  @Post('bulk-import')
  @Roles('ADMIN', 'SECURITY')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Bulk onboard community residents (CSV / JSON)',
    description:
      'Batch registers community members with support for zone/house numbers and optional GPS, dispatches credentials, and returns per-row processing outcomes.',
  })
  @ApiResponse({ status: 200, type: BulkImportResponseDto })
  async bulkImport(
    @Body() dto: BulkImportDto,
    @CurrentUser() currentUser: AuthenticatedUser,
    @Req() req: Request,
  ): Promise<BulkImportResponseDto> {
    const ip = req.ip || req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'];
    return this.usersService.bulkImport(dto, currentUser.id, ip, userAgent);
  }
}
