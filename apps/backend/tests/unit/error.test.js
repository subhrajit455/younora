const AppError = require('../../src/core/errors/appError');
const ERROR_CODES = require('../../src/core/errors/errorCodes');
const { rupeesToPaise, paiseToRupees, formatRupees } = require('../../src/core/utils/money');

describe('Core Errors & Utilities', () => {
  describe('AppError', () => {
    test('creates AppError with correct status and error code', () => {
      const err = new AppError(404, ERROR_CODES.NOT_FOUND, 'User not found');
      expect(err.statusCode).toBe(404);
      expect(err.code).toBe(ERROR_CODES.NOT_FOUND);
      expect(err.message).toBe('User not found');
      expect(err.isOperational).toBe(true);
    });

    test('static factory methods instantiate corresponding status codes', () => {
      const badReq = AppError.badRequest('Invalid payload');
      expect(badReq.statusCode).toBe(400);

      const unauth = AppError.unauthorized();
      expect(unauth.statusCode).toBe(401);

      const forbidden = AppError.forbidden();
      expect(forbidden.statusCode).toBe(403);

      const notFound = AppError.notFound();
      expect(notFound.statusCode).toBe(404);

      const conflict = AppError.conflict('Already exists');
      expect(conflict.statusCode).toBe(409);
    });
  });

  describe('Money Utilities (Rule 7: integer paise only)', () => {
    test('converts rupees to paise accurately without float issues', () => {
      expect(rupeesToPaise(1999)).toBe(199900);
      expect(rupeesToPaise('1999.50')).toBe(199950);
      expect(rupeesToPaise(0.99)).toBe(99);
    });

    test('converts paise to rupees', () => {
      expect(paiseToRupees(199900)).toBe(1999);
      expect(paiseToRupees(199950)).toBe(1999.5);
    });

    test('rejects non-integer paise', () => {
      expect(() => paiseToRupees(1999.5)).toThrow(TypeError);
    });

    test('formats paise into INR currency display', () => {
      const formatted = formatRupees(199900);
      expect(formatted).toContain('1,999');
    });
  });
});

