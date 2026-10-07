import { validateCoordinates } from './coordinate.util';
import { GeoService } from '../../modules/locations/geo.service';

describe('Coordinate & Haversine Utilities', () => {
  const geoService = new GeoService({} as any, {} as any);

  describe('GeoService.calculateDistance (Haversine)', () => {
    it('should return 0 meters for identical coordinates', () => {
      const distance = geoService.calculateDistance(9.0765, 7.3985, 9.0765, 7.3985);
      expect(distance).toBe(0);
    });

    it('should calculate accurate distance between Abuja Maitama and Wuse II (~3.5km)', () => {
      // Maitama: 9.0882, 7.4985
      // Wuse II: 9.0747, 7.4725
      const distance = geoService.calculateDistance(9.0882, 7.4985, 9.0747, 7.4725);
      expect(distance).toBeGreaterThan(3000);
      expect(distance).toBeLessThan(4500);
    });

    it('should accurately calculate small perimeter distances (e.g. 100 meters)', () => {
      // 1 degree latitude ~ 111,139 meters => 0.0009 degrees ~ 100 meters
      const distance = geoService.calculateDistance(9.0765, 7.3985, 9.0774, 7.3985);
      expect(distance).toBeGreaterThan(90);
      expect(distance).toBeLessThan(110);
    });
  });

  describe('validateCoordinates', () => {
    it('should pass for valid coordinates within Nigeria', () => {
      expect(validateCoordinates(9.0765, 7.3985).isValid).toBe(true); // Abuja
      expect(validateCoordinates(6.5244, 3.3792).isWithinNigeria).toBe(true); // Lagos
      expect(validateCoordinates(12.0022, 8.592).isWithinNigeria).toBe(true); // Kano
    });

    it('should reject Null Island (0, 0)', () => {
      expect(() => validateCoordinates(0, 0)).toThrow('Null Island');
    });

    it('should reject extreme invalid coordinates out of [-90, 90] and [-180, 180]', () => {
      expect(() => validateCoordinates(95, 20)).toThrow('Latitude');
      expect(() => validateCoordinates(10, 200)).toThrow('Longitude');
    });

    it('should provide warning for coordinates outside standard Nigerian boundaries', () => {
      const outsideResult = validateCoordinates(51.5074, -0.1278); // London
      expect(outsideResult.isWithinNigeria).toBe(false);
      expect(outsideResult.warning).toContain('outside the standard Nigerian boundary');
    });
  });

  describe('GeoService.computeBoundingBox', () => {
    it('should produce bounding box containing the center coordinate', () => {
      const centerLat = 9.0765;
      const centerLng = 7.3985;
      const radiusMeters = 2000;

      const bbox = geoService.computeBoundingBox(centerLat, centerLng, radiusMeters);

      expect(bbox.minLat).toBeLessThan(centerLat);
      expect(bbox.maxLat).toBeGreaterThan(centerLat);
      expect(bbox.minLng).toBeLessThan(centerLng);
      expect(bbox.maxLng).toBeGreaterThan(centerLng);
    });
  });
});
