# Architecture Decision Record: PostGIS Upgrade Path (ADR-001)

## Status
**Proposed & Designed for Phase 2** (Phase 1 implements spherical Haversine with bounding-box index).

## Context
Aegis Phase 1 operates as a community early-warning system in Nigerian regions. The alerting brain requires identifying which registered residents and security officers are within an incident's alert radius (`alertRadiusMeters`, typically 500m to 3,000m).

### Phase 1 Implementation:
1. **Coordinate Storage:**
   Coordinates are stored as high-precision decimals:
   - `User.latitude`, `User.longitude` (`Decimal(10, 7)`)
   - `Zone.centerLat`, `Zone.centerLng` (`Decimal(10, 7)`)
   - `Incident.latitude`, `Incident.longitude` (`Decimal(10, 7)`)
2. **Database Indexing:**
   Composite B-tree index on `users(latitude, longitude)`.
3. **Query Architecture:**
   - **Bounding-box prefilter:** Queries precalculate min/max latitude and longitude boundaries:
     $$\Delta \text{lat} = \frac{\text{radius}}{111,320}$$
     $$\Delta \text{lng} = \frac{\text{radius}}{111,320 \times \cos(\text{lat}_{\text{rad}})}$$
     Filtering rows matching `lat BETWEEN minLat AND maxLat AND lng BETWEEN minLng AND maxLng` prevents full-table scans.
   - **Haversine Distance:** Rows passing the bounding box are evaluated with the spherical Haversine formula to compute exact geodesic distance in meters.
4. **Interface Isolation:**
   All spatial calculations are encapsulated behind the `GeoService` interface:
   ```typescript
   export interface IGeoService {
     findUsersWithinRadius(
       lat: number,
       lng: number,
       radiusMeters: number,
       options?: RecipientFilterOptions,
     ): Promise<EligibleRecipient[]>;
   }
   ```

## Why Upgrade to PostGIS in Phase 2?
Phase 2 will introduce automated AI/camera triggers and polygon geofences (e.g. administrative wards, natural topography, rivers, custom security patrols) rather than simple circular radii.

## Phase 2 Upgrade Strategy

### Step 1: Enable PostGIS Extension
Add the migration to enable the spatial extension in PostgreSQL:
```sql
CREATE EXTENSION IF NOT EXISTS postgis;
```

### Step 2: Add Geometry Columns
Add native spatial geography columns to `users`, `zones`, and `incidents`:
```sql
-- Add Point geography column
ALTER TABLE users ADD COLUMN location geography(Point, 4326);

-- Populate location column from existing decimal lat/lng
UPDATE users 
SET location = ST_SetSRID(ST_MakePoint(longitude::float8, latitude::float8), 4326)::geography
WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

-- Create spatial GiST index
CREATE INDEX idx_users_location_gist ON users USING GIST (location);
```

### Step 3: Upgrade Polygons for Zones
Expand the `Zone` model to support multi-vertex polygons:
```sql
ALTER TABLE zones ADD COLUMN boundary geography(Polygon, 4326);
CREATE INDEX idx_zones_boundary_gist ON zones USING GIST (boundary);
```

### Step 4: Swap Implementation in `GeoService`
Without altering any controller, incident handler, or worker signature, replace the Haversine raw SQL inside `GeoService` with PostGIS's `ST_DWithin`:
```typescript
// PostGIS Query Implementation
await this.prisma.$queryRaw`
  SELECT u.id, u.name, u.phone, u."preferredLanguage", u.role,
         ST_Distance(u.location, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography) AS distanceMeters
  FROM users u
  WHERE u."isActive" = true
    AND u."alertsEnabled" = true
    AND ST_DWithin(u.location, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography, ${radiusMeters})
  ORDER BY distanceMeters ASC;
`;
```

## Consequences & Safety Guarantees
- **No Caller Regression:** Callers (`IncidentsService`, `AlertsService`) remain decoupled and unmodified.
- **Microsecond Geospatial Querying:** GiST indexes on geography points scale effortlessly beyond 100,000+ registered residents.
- **Zero Downtime Migration:** The transition can be executed online with a backfill script keeping `latitude`/`longitude` and `location` in sync during the rollout.
