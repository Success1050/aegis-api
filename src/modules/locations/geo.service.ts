import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';
import {
  BoundingBox,
  EligibleRecipient,
  FindEligibleRecipientsParams,
  GeoServiceInterface,
  RecipientSelectionResult,
} from './geo.interface';

const EARTH_RADIUS_METERS = 6371000;
const STALE_THRESHOLD_DAYS = 90;
const DEFAULT_MAX_RECIPIENTS = 2000;

@Injectable()
export class GeoService implements GeoServiceInterface {
  private readonly logger = new Logger(GeoService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Calculates great-circle distance between two GPS coordinates using the Haversine formula.
   * Returns distance in meters (rounded to nearest integer).
   */
  calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const toRad = (deg: number) => (deg * Math.PI) / 180;

    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const rLat1 = toRad(lat1);
    const rLat2 = toRad(lat2);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(rLat1) * Math.cos(rLat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return Math.round(EARTH_RADIUS_METERS * c);
  }

  /**
   * Computes a rectangular bounding box around a center point for indexed SQL prefiltering.
   */
  computeBoundingBox(centerLat: number, centerLng: number, radiusMeters: number): BoundingBox {
    const latDelta = radiusMeters / 111320;
    const lngDelta = radiusMeters / (111320 * Math.cos((centerLat * Math.PI) / 180));

    return {
      minLat: centerLat - latDelta,
      maxLat: centerLat + latDelta,
      minLng: centerLng - lngDelta,
      maxLng: centerLng + lngDelta,
    };
  }

  /**
   * Dual-Pillar Recipient Selection Engine:
   * Pillar 1 (Physical Geofence): All active individuals within alertRadiusMeters of the incident coordinates.
   * Pillar 2 (Zone Membership): All registered residents belonging to the incident community zone,
   *                             ensuring members away from home still receive notifications to alert their families.
   * Results are unified and strictly deduplicated by user ID / phone number.
   */
  async findEligibleRecipients(params: FindEligibleRecipientsParams): Promise<RecipientSelectionResult> {
    const { incidentLat, incidentLng, alertRadiusMeters, zoneId } = params;
    const now = Date.now();
    const staleThresholdMs = STALE_THRESHOLD_DAYS * 24 * 60 * 60 * 1000;
    const maxRecipientsCap = this.configService.get<number>(
      'MAX_RECIPIENTS_PER_INCIDENT',
      DEFAULT_MAX_RECIPIENTS,
    );

    const recipientMap = new Map<string, EligibleRecipient>();

    // -------------------------------------------------------------
    // Pillar 1: Physical Geofence (Bounding box prefilter + Haversine)
    // -------------------------------------------------------------
    const bbox = this.computeBoundingBox(incidentLat, incidentLng, alertRadiusMeters);

    const physicalCandidates = await this.prisma.user.findMany({
      where: {
        isActive: true,
        alertsEnabled: true,
        latitude: {
          gte: bbox.minLat,
          lte: bbox.maxLat,
        },
        longitude: {
          gte: bbox.minLng,
          lte: bbox.maxLng,
        },
      },
    });

    for (const candidate of physicalCandidates) {
      if (candidate.latitude === null || candidate.longitude === null) continue;

      const userLat = Number(candidate.latitude);
      const userLng = Number(candidate.longitude);
      const dist = this.calculateDistance(incidentLat, incidentLng, userLat, userLng);

      if (dist <= alertRadiusMeters) {
        const isStale =
          !candidate.locationUpdatedAt ||
          now - candidate.locationUpdatedAt.getTime() > staleThresholdMs;

        recipientMap.set(candidate.id, {
          user: candidate,
          distanceMeters: dist,
          matchReason: 'PHYSICAL_RADIUS',
          isStaleLocation: isStale,
        });
      }
    }

    const physicalRadiusOnlyCount = recipientMap.size;

    // -------------------------------------------------------------
    // Pillar 2: Community Zone Membership (Home Zone Match)
    // -------------------------------------------------------------
    let overlapCount = 0;
    let zoneMembershipOnlyCount = 0;

    if (zoneId) {
      const zoneMembers = await this.prisma.user.findMany({
        where: {
          isActive: true,
          alertsEnabled: true,
          zoneId: zoneId,
        },
      });

      for (const member of zoneMembers) {
        const existing = recipientMap.get(member.id);
        if (existing) {
          existing.matchReason = 'BOTH';
          overlapCount++;
        } else {
          // Resident is part of zone but currently outside blast radius or has no GPS
          let dist: number | null = null;
          let isStale = true;

          if (member.latitude !== null && member.longitude !== null) {
            dist = this.calculateDistance(
              incidentLat,
              incidentLng,
              Number(member.latitude),
              Number(member.longitude),
            );
            isStale =
              !member.locationUpdatedAt ||
              now - member.locationUpdatedAt.getTime() > staleThresholdMs;
          }

          recipientMap.set(member.id, {
            user: member,
            distanceMeters: dist,
            matchReason: 'ZONE_MEMBERSHIP',
            isStaleLocation: isStale,
          });
          zoneMembershipOnlyCount++;
        }
      }
    }

    // -------------------------------------------------------------
    // Breakdown Statistics & Aggregations
    // -------------------------------------------------------------
    const allRecipients = Array.from(recipientMap.values());
    const byLanguage: Record<string, number> = {
      ENGLISH: 0,
      HAUSA: 0,
      IGBO: 0,
      YORUBA: 0,
      PIDGIN: 0,
    };
    const byRole: Record<string, number> = {
      RESIDENT: 0,
      SECURITY: 0,
      ADMIN: 0,
    };

    let staleLocationCount = 0;

    for (const r of allRecipients) {
      const lang = r.user.preferredLanguage || 'ENGLISH';
      byLanguage[lang] = (byLanguage[lang] || 0) + 1;

      const role = r.user.role || 'RESIDENT';
      byRole[role] = (byRole[role] || 0) + 1;

      if (r.isStaleLocation) {
        staleLocationCount++;
      }
    }

    const totalEligible = allRecipients.length;
    const requiresLargeBlastConfirmation = totalEligible > maxRecipientsCap;

    this.logger.log(
      `[GEO_DISPATCH] Resolved ${totalEligible} recipients: Physical=${physicalRadiusOnlyCount}, Zone=${zoneMembershipOnlyCount}, Both=${overlapCount}`,
    );

    return {
      recipients: allRecipients,
      totalEligible,
      breakdown: {
        byPhysicalRadius: physicalRadiusOnlyCount,
        byZoneMembership: zoneMembershipOnlyCount,
        overlapCount,
        byLanguage,
        byRole,
      },
      staleLocationCount,
      requiresLargeBlastConfirmation,
    };
  }
}
