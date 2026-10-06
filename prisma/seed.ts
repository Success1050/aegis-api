import { PrismaClient, Role, Language, IncidentType, Severity, IncidentStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// Default seed passwords
const DEFAULT_ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD || 'AdminSecure2026!';
const DEFAULT_OFFICER_PASSWORD = 'OfficerSecure2026!';
const DEFAULT_RESIDENT_PASSWORD = 'ResidentSecure2026!';

async function main() {
  console.log('🌱 Starting AEGIS database seeding...');

  const passwordHashAdmin = await bcrypt.hash(DEFAULT_ADMIN_PASSWORD, 10);
  const passwordHashOfficer = await bcrypt.hash(DEFAULT_OFFICER_PASSWORD, 10);
  const passwordHashResident = await bcrypt.hash(DEFAULT_RESIDENT_PASSWORD, 10);

  // -------------------------------------------------------------
  // 1. Create Primary Community Zone: "Community A"
  // Coordinates: 9.8980, 8.8570 (Plateau/Kaduna region boundary)
  // -------------------------------------------------------------
  console.log('📍 Upserting Community A Zone...');
  const communityAZone = await prisma.zone.upsert({
    where: { id: 'a0000000-0000-0000-0000-000000000001' },
    update: {
      name: 'Community A (North Ward)',
      centerLat: 9.898,
      centerLng: 8.857,
      radiusMeters: 2000,
      isActive: true,
    },
    create: {
      id: 'a0000000-0000-0000-0000-000000000001',
      name: 'Community A (North Ward)',
      centerLat: 9.898,
      centerLng: 8.857,
      radiusMeters: 2000,
      isActive: true,
    },
  });

  // Secondary zone for multi-zone isolation testing
  const communityBZone = await prisma.zone.upsert({
    where: { id: 'a0000000-0000-0000-0000-000000000002' },
    update: {
      name: 'Community B (South Valley)',
      centerLat: 9.825,
      centerLng: 8.812,
      radiusMeters: 2500,
      isActive: true,
    },
    create: {
      id: 'a0000000-0000-0000-0000-000000000002',
      name: 'Community B (South Valley)',
      centerLat: 9.825,
      centerLng: 8.812,
      radiusMeters: 2500,
      isActive: true,
    },
  });

  // -------------------------------------------------------------
  // 2. Create Users Across Distinct Roles
  // -------------------------------------------------------------

  // Role: ADMIN (Full privileges, user CRUD, zone management, audit log)
  console.log('👑 Seeding Admin User...');
  const adminUser = await prisma.user.upsert({
    where: { phone: '+2348000000001' },
    update: {
      name: 'Super Admin Emmanuel',
      email: 'admin@aegis.ng',
      role: Role.ADMIN,
      preferredLanguage: Language.ENGLISH,
      passwordHash: passwordHashAdmin,
      zoneId: communityAZone.id,
      alertsEnabled: true,
      isActive: true,
    },
    create: {
      name: 'Super Admin Emmanuel',
      email: 'admin@aegis.ng',
      phone: '+2348000000001',
      role: Role.ADMIN,
      preferredLanguage: Language.ENGLISH,
      passwordHash: passwordHashAdmin,
      zoneId: communityAZone.id,
      alertsEnabled: true,
      isActive: true,
    },
  });

  // Role: SECURITY Officer A (Emergency Operations Dispatcher)
  console.log('🛡️  Seeding Security Officers...');
  const officerA = await prisma.user.upsert({
    where: { phone: '+2348020000001' },
    update: {
      name: 'Officer Abubakar Garba',
      email: 'garba@aegis.ng',
      role: Role.SECURITY,
      preferredLanguage: Language.ENGLISH,
      latitude: 9.9001,
      longitude: 8.86,
      houseNumber: 'Command Post Alpha',
      areaDescription: 'North Gate Operations Center',
      locationUpdatedAt: new Date(),
      passwordHash: passwordHashOfficer,
      zoneId: communityAZone.id,
      alertsEnabled: true,
      isActive: true,
    },
    create: {
      name: 'Officer Abubakar Garba',
      email: 'garba@aegis.ng',
      phone: '+2348020000001',
      role: Role.SECURITY,
      preferredLanguage: Language.ENGLISH,
      latitude: 9.9001,
      longitude: 8.86,
      houseNumber: 'Command Post Alpha',
      areaDescription: 'North Gate Operations Center',
      locationUpdatedAt: new Date(),
      passwordHash: passwordHashOfficer,
      zoneId: communityAZone.id,
      alertsEnabled: true,
      isActive: true,
    },
  });

  // Role: SECURITY Officer B (For Four-Eyes Rule Verification Testing)
  const officerB = await prisma.user.upsert({
    where: { phone: '+2348020000002' },
    update: {
      name: 'Officer Bello Musa',
      email: 'musa@aegis.ng',
      role: Role.SECURITY,
      preferredLanguage: Language.ENGLISH,
      latitude: 9.897,
      longitude: 8.855,
      houseNumber: 'Command Post Bravo',
      areaDescription: 'West Perimeter Hub',
      locationUpdatedAt: new Date(),
      passwordHash: passwordHashOfficer,
      zoneId: communityAZone.id,
      alertsEnabled: true,
      isActive: true,
    },
    create: {
      name: 'Officer Bello Musa',
      email: 'musa@aegis.ng',
      phone: '+2348020000002',
      role: Role.SECURITY,
      preferredLanguage: Language.ENGLISH,
      latitude: 9.897,
      longitude: 8.855,
      houseNumber: 'Command Post Bravo',
      areaDescription: 'West Perimeter Hub',
      locationUpdatedAt: new Date(),
      passwordHash: passwordHashOfficer,
      zoneId: communityAZone.id,
      alertsEnabled: true,
      isActive: true,
    },
  });

  // -------------------------------------------------------------
  // 3. Seeding Realistic Residents (~45 users)
  // Multilingual distribution: Hausa, Pidgin, Yoruba, Igbo, English
  // -------------------------------------------------------------
  console.log('👥 Seeding Residents & Edge-Case Accounts...');

  // Specific canonical user from specification: John Danladi (HAUSA, RESIDENT)
  await prisma.user.upsert({
    where: { phone: '+2348030000001' },
    update: {
      name: 'John Danladi',
      email: 'john.danladi@aegis.ng',
      role: Role.RESIDENT,
      preferredLanguage: Language.HAUSA,
      latitude: 9.8965,
      longitude: 8.8583,
      houseNumber: 'Plot 14B',
      areaDescription: 'Angwan Rimi Close',
      locationUpdatedAt: new Date(),
      passwordHash: passwordHashResident,
      zoneId: communityAZone.id,
      alertsEnabled: true,
      isActive: true,
    },
    create: {
      name: 'John Danladi',
      email: 'john.danladi@aegis.ng',
      phone: '+2348030000001',
      role: Role.RESIDENT,
      preferredLanguage: Language.HAUSA,
      latitude: 9.8965,
      longitude: 8.8583,
      houseNumber: 'Plot 14B',
      areaDescription: 'Angwan Rimi Close',
      locationUpdatedAt: new Date(),
      passwordHash: passwordHashResident,
      zoneId: communityAZone.id,
      alertsEnabled: true,
      isActive: true,
    },
  });

  // Stale date for stale location edge cases (120 days ago)
  const staleDate = new Date();
  staleDate.setDate(staleDate.getDate() - 120);

  // Resident profiles dataset
  const residentDefinitions = [
    // --- Inside Community A Radius (< 2 km) ---
    { name: 'Amina Yusuf', phone: '+2348030000002', lang: Language.HAUSA, lat: 9.8972, lng: 8.8569 },
    { name: 'Chukwudi Eze', phone: '+2348030000003', lang: Language.IGBO, lat: 9.899, lng: 8.858 },
    { name: 'Olumide Adeyemi', phone: '+2348030000004', lang: Language.YORUBA, lat: 9.8975, lng: 8.856 },
    { name: 'Blessing Osas', phone: '+2348030000005', lang: Language.PIDGIN, lat: 9.8985, lng: 8.8575 },
    { name: 'Ibrahim Haruna', phone: '+2348030000006', lang: Language.HAUSA, lat: 9.8955, lng: 8.859 },
    { name: 'Ngozi Okonjo', phone: '+2348030000007', lang: Language.IGBO, lat: 9.8995, lng: 8.8565 },
    { name: 'Babajide Sanwo', phone: '+2348030000008', lang: Language.YORUBA, lat: 9.8982, lng: 8.8555 },
    { name: 'Efe Warri', phone: '+2348030000009', lang: Language.PIDGIN, lat: 9.8968, lng: 8.8572 },
    { name: 'Fatima Aliyu', phone: '+2348030000010', lang: Language.HAUSA, lat: 9.8978, lng: 8.8585 },
    { name: 'Chinedu Obi', phone: '+2348030000011', lang: Language.IGBO, lat: 9.9002, lng: 8.8578 },
    { name: 'Adeola Adeleke', phone: '+2348030000012', lang: Language.YORUBA, lat: 9.896, lng: 8.8562 },
    { name: 'Tariere Doubra', phone: '+2348030000013', lang: Language.PIDGIN, lat: 9.8989, lng: 8.8582 },
    { name: 'Aliyu Mohammed', phone: '+2348030000014', lang: Language.HAUSA, lat: 9.8958, lng: 8.8578 },
    { name: 'Emeka Nwosu', phone: '+2348030000015', lang: Language.IGBO, lat: 9.8998, lng: 8.8558 },
    { name: 'Funmilayo Ransome', phone: '+2348030000016', lang: Language.YORUBA, lat: 9.8971, lng: 8.8588 },
    { name: 'Lucky Akpan', phone: '+2348030000017', lang: Language.PIDGIN, lat: 9.8984, lng: 8.8563 },
    { name: 'Zainab Lawal', phone: '+2348030000018', lang: Language.HAUSA, lat: 9.8963, lng: 8.8552 },
    { name: 'Somtochukwu Kalu', phone: '+2348030000019', lang: Language.IGBO, lat: 9.8992, lng: 8.8592 },
    { name: 'Segun Arinze', phone: '+2348030000020', lang: Language.YORUBA, lat: 9.8977, lng: 8.8548 },
    { name: 'Victor Osimhen', phone: '+2348030000021', lang: Language.PIDGIN, lat: 9.8981, lng: 8.8595 },
    { name: 'Maryam Sani', phone: '+2348030000022', lang: Language.HAUSA, lat: 9.8952, lng: 8.8567 },
    { name: 'Obinna Nwaneri', phone: '+2348030000023', lang: Language.IGBO, lat: 9.9005, lng: 8.8568 },
    { name: 'Bukola Saraki', phone: '+2348030000024', lang: Language.YORUBA, lat: 9.8966, lng: 8.8587 },
    { name: 'Ini Edo', phone: '+2348030000025', lang: Language.PIDGIN, lat: 9.8987, lng: 8.8553 },
    { name: 'Suleiman Gumi', phone: '+2348030000026', lang: Language.HAUSA, lat: 9.8959, lng: 8.8598 },
    { name: 'Nkem Owoh', phone: '+2348030000027', lang: Language.IGBO, lat: 9.8996, lng: 8.8586 },
    { name: 'Olawale Ashimi', phone: '+2348030000028', lang: Language.YORUBA, lat: 9.8974, lng: 8.8542 },
    { name: 'Mercy Johnson', phone: '+2348030000029', lang: Language.PIDGIN, lat: 9.8983, lng: 8.8577 },
    { name: 'Halima Dangote', phone: '+2348030000030', lang: Language.HAUSA, lat: 9.8967, lng: 8.8566 },
    { name: 'Kelechi Iheanacho', phone: '+2348030000031', lang: Language.IGBO, lat: 9.9008, lng: 8.8573 },
    { name: 'Folarin Falana', phone: '+2348030000032', lang: Language.YORUBA, lat: 9.8962, lng: 8.8579 },
    { name: 'Frank Edoho', phone: '+2348030000033', lang: Language.ENGLISH, lat: 9.8986, lng: 8.8568 },
    { name: 'Usman Danfodio', phone: '+2348030000034', lang: Language.HAUSA, lat: 9.8954, lng: 8.8584 },
    { name: 'Chidinma Ekile', phone: '+2348030000035', lang: Language.ENGLISH, lat: 9.8993, lng: 8.8571 },
    { name: 'Ayodeji Balogun', phone: '+2348030000036', lang: Language.YORUBA, lat: 9.8979, lng: 8.8564 },

    // --- Edge Cases Inside Community A ---
    // Stale location (> 90 days old)
    {
      name: 'Musa Abdullahi (Stale Location)',
      phone: '+2348030000037',
      lang: Language.HAUSA,
      lat: 9.8981,
      lng: 8.8571,
      locationUpdatedAt: staleDate,
    },
    // Opted out of SMS alerts (alertsEnabled = false)
    {
      name: 'Tunde Bakare (Opted Out)',
      phone: '+2348030000038',
      lang: Language.YORUBA,
      lat: 9.8982,
      lng: 8.8572,
      alertsEnabled: false,
    },
    // Deactivated user (isActive = false)
    {
      name: 'Kalu Nnamdi (Deactivated)',
      phone: '+2348030000039',
      lang: Language.IGBO,
      lat: 9.8983,
      lng: 8.8573,
      isActive: false,
    },
    // Missing coordinates (null lat/lng) - Registered via Zone + Address
    {
      name: 'Fatima Ibrahim (No Coordinates)',
      phone: '+2348030000040',
      email: 'fatima.ibrahim@aegis.ng',
      lang: Language.HAUSA,
      lat: null,
      lng: null,
      houseNumber: 'Compound 7A',
      areaDescription: 'Near Central Mosque, Community A',
    },
    {
      name: 'Osasere Idehen (No Coordinates)',
      phone: '+2348030000041',
      email: 'osasere.idehen@aegis.ng',
      lang: Language.PIDGIN,
      lat: null,
      lng: null,
      houseNumber: 'Block 3, Flat 2',
      areaDescription: 'Market Road Junction',
    },

    // --- Far Away from Community A (5–8 km away, registered to Community B) ---
    { name: 'Bello Faraway 1', phone: '+2348030000042', lang: Language.HAUSA, lat: 9.95, lng: 8.91, zoneId: communityBZone.id },
    { name: 'Chidi Faraway 2', phone: '+2348030000043', lang: Language.IGBO, lat: 9.83, lng: 8.79, zoneId: communityBZone.id },
    { name: 'Kunle Faraway 3', phone: '+2348030000044', lang: Language.YORUBA, lat: 9.96, lng: 8.82, zoneId: communityBZone.id },
    { name: 'Ese Faraway 4', phone: '+2348030000045', lang: Language.PIDGIN, lat: 9.84, lng: 8.92, zoneId: communityBZone.id },
  ];

  for (const def of residentDefinitions) {
    const extra = def as { email?: string; houseNumber?: string; areaDescription?: string; zoneId?: string };
    const targetZoneId = extra.zoneId || communityAZone.id;
    await prisma.user.upsert({
      where: { phone: def.phone },
      update: {
        name: def.name,
        email: extra.email || null,
        houseNumber: extra.houseNumber || null,
        areaDescription: extra.areaDescription || null,
        role: Role.RESIDENT,
        preferredLanguage: def.lang,
        latitude: def.lat,
        longitude: def.lng,
        locationUpdatedAt: def.locationUpdatedAt || (def.lat ? new Date() : null),
        passwordHash: passwordHashResident,
        zoneId: targetZoneId,
        alertsEnabled: def.alertsEnabled !== undefined ? def.alertsEnabled : true,
        isActive: def.isActive !== undefined ? def.isActive : true,
      },
      create: {
        name: def.name,
        phone: def.phone,
        email: extra.email || null,
        houseNumber: extra.houseNumber || null,
        areaDescription: extra.areaDescription || null,
        role: Role.RESIDENT,
        preferredLanguage: def.lang,
        latitude: def.lat,
        longitude: def.lng,
        locationUpdatedAt: def.locationUpdatedAt || (def.lat ? new Date() : null),
        passwordHash: passwordHashResident,
        zoneId: targetZoneId,
        alertsEnabled: def.alertsEnabled !== undefined ? def.alertsEnabled : true,
        isActive: def.isActive !== undefined ? def.isActive : true,
      },
    });
  }

  // -------------------------------------------------------------
  // 4. Initialize Incident Sequence Counter
  // -------------------------------------------------------------
  console.log('🔢 Initializing Incident Sequence Counter...');
  const existingSeq = await prisma.incidentSequence.findFirst();
  if (!existingSeq) {
    await prisma.incidentSequence.create({
      data: { current: 0 },
    });
  }

  // -------------------------------------------------------------
  // 5. Seed Initial Demo Incident (INC-000001, PENDING_REVIEW)
  // Ready for verification flow in §14
  // -------------------------------------------------------------
  console.log('📋 Creating Demo Incident INC-000001...');
  await prisma.incident.upsert({
    where: { number: 'INC-000001' },
    update: {
      type: IncidentType.POSSIBLE_INTRUSION,
      description: 'Multiple people reported unusual movement near the northern boundary.',
      severity: Severity.HIGH,
      status: IncidentStatus.PENDING_REVIEW,
      latitude: 9.898,
      longitude: 8.857,
      alertRadiusMeters: 2000,
      zoneId: communityAZone.id,
      reportedById: officerA.id,
    },
    create: {
      number: 'INC-000001',
      type: IncidentType.POSSIBLE_INTRUSION,
      description: 'Multiple people reported unusual movement near the northern boundary.',
      severity: Severity.HIGH,
      status: IncidentStatus.PENDING_REVIEW,
      latitude: 9.898,
      longitude: 8.857,
      alertRadiusMeters: 2000,
      zoneId: communityAZone.id,
      reportedById: officerA.id,
      version: 1,
    },
  });

  console.log('\n✅ Database seeding completed successfully!');
  console.log('----------------------------------------------------');
  console.log(`👤 ADMIN Account:      +2348000000001 (Pass: ${DEFAULT_ADMIN_PASSWORD})`);
  console.log(`🛡️  OFFICER A Account:  +2348020000001 (Pass: ${DEFAULT_OFFICER_PASSWORD})`);
  console.log(`🛡️  OFFICER B Account:  +2348020000002 (Pass: ${DEFAULT_OFFICER_PASSWORD})`);
  console.log(`📱 John (HAUSA):       +2348030000001 (Pass: ${DEFAULT_RESIDENT_PASSWORD})`);
  console.log(`🏘️  Community A Zone:   Center 9.8980, 8.8570 | Radius: 2000m`);
  console.log(`📊 Residents Total:    45 Seeded (~37 eligible inside 2km radius)`);
  console.log(`🚨 Incident INC-000001: PENDING_REVIEW ready for Officer verification`);
  console.log('----------------------------------------------------');
}

main()
  .catch((e) => {
    console.error('❌ Seeding error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
