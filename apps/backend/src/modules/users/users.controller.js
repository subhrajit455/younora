const UsersService = require('./users.service');
const { sendSuccess } = require('../../core/http/response');

class UsersController {
  static async createStaff(req, res, next) {
    try {
      const staff = await UsersService.createStaff(req.body);
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
      const staff = await UsersService.updateStaff(req.params.id, req.body, req.user);
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
      const result = await UsersService.deactivateStaff(req.params.id, req.user);
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
      const result = await UsersService.reactivateStaff(req.params.id, req.user);
      return sendSuccess(res, {
        message: 'Staff member reactivated successfully',
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = UsersController;

