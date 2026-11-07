const Settings = require('./models/settings.model');
const AuditLog = require('../audit/models/auditLog.model');
const AppError = require('../../core/errors/appError');
const { SETTINGS_SECTIONS } = require('@younora/shared-constants');

class SettingsService {
  /**
   * Fetches full settings document
   */
  async getSettings() {
    return Settings.getSettings();
  }

  /**
   * Fetches public checkout-safe store settings
   */
  async getPublicConfig() {
    const s = await Settings.getSettings();
    return {
      store: {
        name: s.store.name,
        email: s.store.email,
        phone: s.store.phone,
        stateCode: s.store.stateCode,
      },
      payments: {
        onlineEnabled: s.payments.onlineEnabled,
        codEnabled: s.payments.codEnabled,
        codMinOrder: s.payments.codMinOrder,
        codMaxOrder: s.payments.codMaxOrder,
        codFee: s.payments.codFee,
        codBlockedPincodes: s.payments.codBlockedPincodes,
      },
      shipping: {
        freeShippingAbove: s.shipping.freeShippingAbove,
        flatFee: s.shipping.flatFee,
      },
      returns: {
        policyText: s.returns.policyText,
        windowDays: s.returns.windowDays,
      },
      tax: {
        pricesInclusiveOfTax: s.tax.pricesInclusiveOfTax,
      },
      reselling: {
        enabled: s.reselling.enabled,
      },
    };
  }

  /**
   * Updates a specific section of the settings document with audit trail
   */
  async updateSection(sectionName, updateData, { actor = null } = {}) {
    const validSections = Object.values(SETTINGS_SECTIONS);
    const normalizedSection = (sectionName || '').toLowerCase().trim();

    if (!validSections.includes(normalizedSection)) {
      throw AppError.badRequest(
        `Invalid settings section '${sectionName}'. Allowed sections: ${validSections.join(', ')}`
      );
    }

    const settings = await Settings.getSettings();
    const beforeSectionData = JSON.parse(JSON.stringify(settings[normalizedSection] || {}));

    // Merge or replace fields inside the specified section
    if (typeof updateData !== 'object' || updateData === null || Array.isArray(updateData)) {
      throw AppError.badRequest('Section update payload must be an object');
    }

    Object.assign(settings[normalizedSection], updateData);
    settings.markModified(normalizedSection);
    await settings.save();

    const afterSectionData = JSON.parse(JSON.stringify(settings[normalizedSection] || {}));

    if (actor) {
      await AuditLog.create({
        actor: actor._id || actor.id || actor,
        actorRole: actor.role || 'ADMIN',
        actorEmail: actor.email || '',
        action: `settings.${normalizedSection}.update`,
        entity: 'Settings',
        entityId: settings._id.toString(),
        before: beforeSectionData,
        after: afterSectionData,
      });
    }

    return settings[normalizedSection];
  }
}

module.exports = new SettingsService();

