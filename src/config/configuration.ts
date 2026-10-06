export default () => ({
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '4000', 10),
  databaseUrl: process.env.DATABASE_URL,
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:3000').split(',').map((s) => s.trim()),

  redis: {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
  },

  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET || 'aegis-dev-super-secure-access-token-secret-key-32-chars!',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'aegis-dev-super-secure-refresh-token-secret-key-32-chars!',
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  },

  sms: {
    provider: process.env.SMS_PROVIDER || 'fake',
    senderId: process.env.SMS_SENDER_ID || 'AEGIS',
    fakeFailRate: parseFloat(process.env.FAKE_SMS_FAIL_RATE || '0'),
    fakeLatencyMs: parseInt(process.env.FAKE_SMS_LATENCY_MS || '50', 10),
    preserveDiacritics: process.env.PRESERVE_DIACRITICS === 'true',
  },

  policies: {
    allowSelfVerify: process.env.ALLOW_SELF_VERIFY === 'true',
    allowUnreviewedTemplates: process.env.ALLOW_UNREVIEWED_TEMPLATES === 'true',
    incidentExpiryMinutes: parseInt(process.env.INCIDENT_EXPIRY_MINUTES || '60', 10),
    maxRecipientsPerIncident: parseInt(process.env.MAX_RECIPIENTS_PER_INCIDENT || '2000', 10),
  },

  security: {
    webhookHmacSecret: process.env.WEBHOOK_HMAC_SECRET || 'aegis-webhook-dev-secret-key-signature',
  },
});
