import { User } from '@prisma/client';

export interface BoundingBox {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

export interface EligibleRecipient {
  user: User;
  distanceMeters: number | null;
  matchReason: 'PHYSICAL_RADIUS' | 'ZONE_MEMBERSHIP' | 'BOTH';
  isStaleLocation: boolean;
}

export interface RecipientSelectionResult {
  recipients: EligibleRecipient[];
  totalEligible: number;
  breakdown: {
    byPhysicalRadius: number;
    byZoneMembership: number;
    overlapCount: number;
    byLanguage: Record<string, number>;
    byRole: Record<string, number>;
  };
  staleLocationCount: number;
  requiresLargeBlastConfirmation: boolean;
}

export interface FindEligibleRecipientsParams {
  incidentLat: number;
  incidentLng: number;
  alertRadiusMeters: number;
  zoneId?: string | null;
  includeStale?: boolean;
}

export interface GeoServiceInterface {
  calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number;
  computeBoundingBox(centerLat: number, centerLng: number, radiusMeters: number): BoundingBox;
  findEligibleRecipients(params: FindEligibleRecipientsParams): Promise<RecipientSelectionResult>;
}
