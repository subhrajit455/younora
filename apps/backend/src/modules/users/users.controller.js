const UsersService = require('./users.service');
const { sendSuccess } = require('../../core/http/response');

class UsersController {
  static async createStaff(req, res, next) {
    try {
      const context = {
        actor: req.user,
        ip: req.ip,
        userAgent: req.headers['user-agent'],
      };
      const staff = await UsersService.createStaff(req.body, context);
      return sendSuccess(res, {
        statusCode: 201,
        message: 'Staff member created successfully',
        data: staff,
      });
    } catch (error) {
      next(error);
    }
  }

  static async listStaff(req, res, next) {
    try {
      const result = await UsersService.listStaff(req.query);
      return sendSuccess(res, {
        message: 'Staff list retrieved successfully',
        data: result.staff,
        meta: result.meta,
      });
    } catch (error) {
      next(error);
    }
  }

  static async getStaffById(req, res, next) {
    try {
      const staff = await UsersService.getStaffById(req.params.id);
      return sendSuccess(res, {
        message: 'Staff details retrieved successfully',
        data: staff,
      });
    } catch (error) {
      next(error);
    }
  }

  static async updateStaff(req, res, next) {
    try {
      const context = {
        ip: req.ip,
        userAgent: req.headers['user-agent'],
      };
      const staff = await UsersService.updateStaff(req.params.id, req.body, req.user, context);
      return sendSuccess(res, {
        message: 'Staff member updated successfully',
        data: staff,
      });
    } catch (error) {
      next(error);
    }
  }

  static async deactivateStaff(req, res, next) {
    try {
      const context = {
        ip: req.ip,
        userAgent: req.headers['user-agent'],
      };
      const result = await UsersService.deactivateStaff(req.params.id, req.user, context);
      return sendSuccess(res, {
        message: 'Staff member deactivated successfully',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  static async reactivateStaff(req, res, next) {
    try {
      const context = {
        ip: req.ip,
        userAgent: req.headers['user-agent'],
      };
      const result = await UsersService.reactivateStaff(req.params.id, req.user, context);
      return sendSuccess(res, {
        message: 'Staff member reactivated successfully',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  // Admin Profile Handlers
  static async getAdminProfile(req, res, next) {
    try {
      const admin = await UsersService.getAdminProfile(req.user._id);
      return sendSuccess(res, {
        message: 'Admin profile retrieved successfully',
        data: admin,
      });
    } catch (error) {
      next(error);
    }
  }

  static async updateAdminProfile(req, res, next) {
    try {
      const admin = await UsersService.updateAdminProfile(req.user._id, req.body);
      return sendSuccess(res, {
        message: 'Admin profile updated successfully',
        data: admin,
      });
    } catch (error) {
      next(error);
    }
  }

  static async changeAdminPassword(req, res, next) {
    try {
      const context = {
        ip: req.ip,
        userAgent: req.headers['user-agent'],
      };
      const result = await UsersService.changeAdminPassword(
        req.user._id,
        req.body.currentPassword,
        req.body.newPassword,
        context
      );
      return sendSuccess(res, {
        message: result.message,
      });
    } catch (error) {
      next(error);
    }
  }

  // Customer Profile Handlers
  static async getCustomerProfile(req, res, next) {
    try {
      const customer = await UsersService.getCustomerProfile(req.user._id);
      return sendSuccess(res, {
        message: 'Customer profile retrieved successfully',
        data: customer,
      });
    } catch (error) {
      next(error);
    }
  }

  static async updateCustomerProfile(req, res, next) {
    try {
      const customer = await UsersService.updateCustomerProfile(req.user._id, req.body);
      return sendSuccess(res, {
        message: 'Customer profile updated successfully',
        data: customer,
      });
    } catch (error) {
      next(error);
    }
  }

  static async changeCustomerPassword(req, res, next) {
    try {
      const result = await UsersService.changeCustomerPassword(
        req.user._id,
        req.body.currentPassword,
        req.body.newPassword
      );
      return sendSuccess(res, {
        message: result.message,
      });
    } catch (error) {
      next(error);
    }
  }

  // Customer Address Handlers
  static async listAddresses(req, res, next) {
    try {
      const addresses = await UsersService.listAddresses(req.user._id);
      return sendSuccess(res, {
        message: 'Addresses retrieved successfully',
        data: addresses,
      });
    } catch (error) {
      next(error);
    }
  }

  static async createAddress(req, res, next) {
    try {
      const address = await UsersService.createAddress(req.user._id, req.body);
      return sendSuccess(res, {
        statusCode: 201,
        message: 'Address created successfully',
        data: address,
      });
    } catch (error) {
      next(error);
    }
  }

  static async getAddressById(req, res, next) {
    try {
      const address = await UsersService.getAddressById(req.user._id, req.params.id);
      return sendSuccess(res, {
        message: 'Address details retrieved successfully',
        data: address,
      });
    } catch (error) {
      next(error);
    }
  }

  static async updateAddress(req, res, next) {
    try {
      const address = await UsersService.updateAddress(
        req.user._id,
        req.params.id,
        req.body
      );
      return sendSuccess(res, {
        message: 'Address updated successfully',
        data: address,
      });
    } catch (error) {
      next(error);
    }
  }

  static async deleteAddress(req, res, next) {
    try {
      const result = await UsersService.deleteAddress(req.user._id, req.params.id);
      return sendSuccess(res, {
        message: 'Address deleted successfully',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }

  static async setDefaultAddress(req, res, next) {
    try {
      const address = await UsersService.setDefaultAddress(req.user._id, req.params.id);
      return sendSuccess(res, {
        message: 'Default address updated successfully',
        data: address,
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = UsersController;

