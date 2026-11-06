const bcrypt = require('bcryptjs');
const { env } = require('../config/env');
const { connectDB, disconnectDB } = require('../config/db');
const AdminUser = require('../modules/users/models/adminUser.model');
const { ROLES, ALL_PERMISSIONS } = require('@younora/shared-constants');
const logger = require('../core/logger');

async function seedSuperAdmin() {
  // Security guard: refuse default password in production
  if (
    env.NODE_ENV === 'production' &&
    env.SUPER_ADMIN_PASSWORD === 'SuperAdmin@123456'
  ) {
    throw new Error(
      'Security Exception: Refusing to seed default placeholder SUPER_ADMIN_PASSWORD in production environment.'
    );
  }

  const normalizedEmail = env.SUPER_ADMIN_EMAIL.toLowerCase().trim();
  const existingAdmin = await AdminUser.findOne({ email: normalizedEmail });

  if (existingAdmin) {
    logger.info({
      email: normalizedEmail,
      msg: 'Super Admin already exists. Skipping seed.',
    });
    return existingAdmin;
  }

  const saltRounds = Math.max(env.BCRYPT_SALT_ROUNDS, 12);
  const passwordHash = await bcrypt.hash(env.SUPER_ADMIN_PASSWORD, saltRounds);

  const superAdmin = await AdminUser.create({
    name: env.SUPER_ADMIN_NAME,
    email: normalizedEmail,
    passwordHash,
    role: ROLES.SUPER_ADMIN,
    permissions: ALL_PERMISSIONS,
    isActive: true,
  });

  logger.info({
    id: superAdmin._id,
    email: superAdmin.email,
    role: superAdmin.role,
    msg: 'Super Admin successfully seeded.',
  });

  return superAdmin;
}

// Allow direct CLI execution: node src/seed/admin.seed.js
if (require.main === module) {
  (async () => {
    try {
      await connectDB();
      await seedSuperAdmin();
      await disconnectDB();
      process.exit(0);
    } catch (err) {
      logger.fatal({ err, msg: 'Failed to seed super admin' });
      process.exit(1);
    }
  })();
}

module.exports = { seedSuperAdmin };

