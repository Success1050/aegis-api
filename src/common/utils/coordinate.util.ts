import { BadRequestException } from '@nestjs/common';

export interface CoordinateValidationResult {
  isValid: boolean;
  isWithinNigeria: boolean;
  isPossiblySwapped: boolean;
  warning?: string;
}

// Approximate geographic bounding box of Nigeria
const NIGERIA_BOUNDS = {
  minLat: 4.0,
  maxLat: 14.0,
  minLng: 2.5,
  maxLng: 15.0,
};

/**
 * Validates coordinate pair for sanity, bounds, Null Island (0,0), and out-of-Nigeria soft warning.
 */
export function validateCoordinates(
  latitude?: number | null,
  longitude?: number | null,
): CoordinateValidationResult {
  if (latitude === undefined || latitude === null || longitude === undefined || longitude === null) {
    return {
      isValid: true, // Null coordinates are valid for zone-only registrations
      isWithinNigeria: false,
      isPossiblySwapped: false,
    };
  }

  const lat = Number(latitude);
  const lng = Number(longitude);

  if (isNaN(lat) || isNaN(lng)) {
    throw new BadRequestException('Coordinates must be valid numeric values.');
  }

  if (lat < -90 || lat > 90) {
    throw new BadRequestException(`Latitude ${lat} is out of valid bounds [-90, 90].`);
  }

  if (lng < -180 || lng > 180) {
    throw new BadRequestException(`Longitude ${lng} is out of valid bounds [-180, 180].`);
  }

  // Null Island check
  if (Math.abs(lat) < 0.0001 && Math.abs(lng) < 0.0001) {
    throw new BadRequestException('Coordinates (0,0) [Null Island] are not allowed for alert dispatch.');
  }

  const isWithinNigeria =
    lat >= NIGERIA_BOUNDS.minLat &&
    lat <= NIGERIA_BOUNDS.maxLat &&
    lng >= NIGERIA_BOUNDS.minLng &&
    lng <= NIGERIA_BOUNDS.maxLng;

  // Swapped coordinates detection: e.g. lng was passed as lat, lat as lng
  const isPossiblySwapped =
    lng >= NIGERIA_BOUNDS.minLat &&
    lng <= NIGERIA_BOUNDS.maxLat &&
    lat >= NIGERIA_BOUNDS.minLng &&
    lat <= NIGERIA_BOUNDS.maxLng &&
    !isWithinNigeria;

  let warning: string | undefined;
  if (!isWithinNigeria) {
    if (isPossiblySwapped) {
      warning = `Warning: Coordinates (${lat}, ${lng}) appear to be swapped (latitude and longitude inverted).`;
    } else {
      warning = `Notice: Coordinates (${lat}, ${lng}) lie outside the standard Nigerian boundary.`;
    }
  }

  return {
    isValid: true,
    isWithinNigeria,
    isPossiblySwapped,
    warning,
  };
}
