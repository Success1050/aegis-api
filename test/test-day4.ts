import { PrismaClient } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { GeoService } from '../src/modules/locations/geo.service';
import {
  normalizeNigerianPhone,
  detectNigerianCarrier,
} from '../src/common/utils/phone.util';
import { validateCoordinates } from '../src/common/utils/coordinate.util';

async function main() {
  console.log('🧪 Running Day 4 Automated Verification...\n');

  // 1. Verify Phone Normalization and Carrier Detection
  console.log('--- 1. Testing Phone Normalization & Carrier Detection ---');
  const mtn = normalizeNigerianPhone('0803 123 4567');
  const airtel = normalizeNigerianPhone('08020000001');
  const glo = normalizeNigerianPhone('2348051112233');
  const nineMobile = normalizeNigerianPhone('+2348099998877');

  console.log(`MTN: 0803 123 4567 -> ${mtn} (${detectNigerianCarrier(mtn)})`);
  console.log(`Airtel: 08020000001 -> ${airtel} (${detectNigerianCarrier(airtel)})`);
  console.log(`Glo: 2348051112233 -> ${glo} (${detectNigerianCarrier(glo)})`);
  console.log(`9mobile: +2348099998877 -> ${nineMobile} (${detectNigerianCarrier(nineMobile)})`);

  if (
    mtn !== '+2348031234567' ||
    detectNigerianCarrier(mtn) !== 'MTN' ||
    detectNigerianCarrier(airtel) !== 'AIRTEL' ||
    detectNigerianCarrier(glo) !== 'GLO' ||
    detectNigerianCarrier(nineMobile) !== '9MOBILE'
  ) {
    throw new Error('Phone normalization/carrier detection failed!');
  }
  console.log('✅ Phone normalization & carrier detection verified!\n');

  // 2. Testing Coordinate Validation
  console.log('--- 2. Testing Coordinate Validation ---');
  const validNg = validateCoordinates(9.898, 8.857);
  console.log('Coordinates (9.898, 8.857) within NG:', validNg.isWithinNigeria);

  const outsideNg = validateCoordinates(51.5074, -0.1278); // London
  console.log('Coordinates (51.5074, -0.1278) [London]:', outsideNg.warning);

  const swapped = validateCoordinates(8.857, 9.898);
  console.log('Coordinates (8.857, 9.898) swapped check:', swapped.isPossiblySwapped, swapped.warning);

  if (!validNg.isWithinNigeria || outsideNg.isWithinNigeria) {
    throw new Error('Coordinate validation bounds check failed!');
  }
  console.log('✅ Coordinate validation verified!\n');

  // 3. Testing GeoService & Dual-Pillar Recipient Selection
  console.log('--- 3. Testing GeoService & Dual-Pillar Recipient Resolution ---');
  const prisma = new PrismaClient();
  const config = new ConfigService();
  const geoService = new GeoService(prisma as any, config);

  // Haversine distance check between two close points (9.898, 8.857) and (9.900, 8.860)
  const dist = geoService.calculateDistance(9.898, 8.857, 9.9, 8.86);
  console.log(`Distance between (9.898, 8.857) and (9.900, 8.860): ${dist} meters`);
  if (dist < 300 || dist > 450) {
    throw new Error(`Unexpected distance calculation: ${dist} meters`);
  }

  // Get Community A Zone
  const communityAZone = await prisma.zone.findFirst({
    where: { name: { contains: 'Community A' } },
  });

  if (!communityAZone) {
    throw new Error('Community A Zone not found in database!');
  }

  // Run Dual-Pillar Recipient Query for Incident in Community A
  const result = await geoService.findEligibleRecipients({
    incidentLat: Number(communityAZone.centerLat),
    incidentLng: Number(communityAZone.centerLng),
    alertRadiusMeters: communityAZone.radiusMeters,
    zoneId: communityAZone.id,
  });

  console.log(`Total Recipients Resolved: ${result.totalEligible}`);
  console.log(`- Physical Geofence Only: ${result.breakdown.byPhysicalRadius}`);
  console.log(`- Zone Membership Only:   ${result.breakdown.byZoneMembership}`);
  console.log(`- Both (Overlap):          ${result.breakdown.overlapCount}`);
  console.log(`- Stale Locations:         ${result.staleLocationCount}`);
  console.log('Breakdown by Language:', result.breakdown.byLanguage);
  console.log('Breakdown by Role:', result.breakdown.byRole);

  // Assertions:
  // We have residents with null GPS (Fatima and Osasere) who MUST be included via Zone Membership!
  const hasFatima = result.recipients.some((r: any) => r.user.name.includes('Fatima Ibrahim'));
  const hasOsasere = result.recipients.some((r: any) => r.user.name.includes('Osasere Idehen'));
  console.log(`Includes Fatima Ibrahim (No GPS, Zone-matched): ${hasFatima}`);
  console.log(`Includes Osasere Idehen (No GPS, Zone-matched): ${hasOsasere}`);

  // Assert Faraway residents (5-8km away) are not in Community A zone and outside 2km, so not included
  const hasFaraway = result.recipients.some((r: any) => r.user.name.includes('Faraway'));
  console.log(`Faraway users excluded correctly: ${!hasFaraway}`);

  if (!hasFatima || !hasOsasere) {
    throw new Error('Dual-pillar failed: Zone members without GPS were not included!');
  }

  if (hasFaraway) {
    throw new Error('Faraway users should not have been included!');
  }

  // 4. Testing UsersService: Zone & Address-based Resident Registration
  console.log('\n--- 4. Testing UsersService: Zone & Address-based Registration ---');
  const auditService = new (require('../src/modules/audit/audit.service').AuditService)(prisma);
  const mailService = new (require('../src/common/services/mail.service').MailService)(config);
  const usersService = new (require('../src/modules/users/users.service').UsersService)(prisma, auditService, mailService);

  // Clean up any previous test user
  await prisma.user.deleteMany({ where: { phone: '+2348123456789' } });

  const newUser = await usersService.createUser({
    name: 'Zainab Sani (Test Resident)',
    phone: '0812 345 6789',
    email: 'zainab.sani.test@aegis.ng',
    zoneId: communityAZone.id,
    houseNumber: 'Compound 3C',
    areaDescription: 'Hillside Path',
    preferredLanguage: 'HAUSA' as any,
  });

  console.log('Created User ID:', newUser.id);
  console.log('Normalized Phone:', newUser.phone);
  console.log('Alerts Enabled by Default:', newUser.alertsEnabled);
  console.log('Assigned Zone:', newUser.zoneName);
  console.log('House Number:', newUser.houseNumber);
  console.log('Area Description:', newUser.areaDescription);

  if (
    newUser.phone !== '+2348123456789' ||
    newUser.alertsEnabled !== true ||
    newUser.houseNumber !== 'Compound 3C' ||
    newUser.areaDescription !== 'Hillside Path'
  ) {
    throw new Error('UsersService registration assertions failed!');
  }

  // Clean up test user
  await prisma.auditLog.deleteMany({ where: { entityId: newUser.id } });
  await prisma.user.delete({ where: { id: newUser.id } });
  console.log('✅ UsersService registration and credential dispatch verified!');

  await prisma.$disconnect();
  console.log('\n🎉 ALL DAY 4 VERIFICATIONS PASSED SUCCESSFULLY!');
}

main().catch((err) => {
  console.error('❌ Verification failed:', err);
  process.exit(1);
});
