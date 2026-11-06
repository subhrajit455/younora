/**
 * Express middleware for Zod schema validation
 * @param {object} schemas - { body?: ZodSchema, query?: ZodSchema, params?: ZodSchema }
 */
function validate(schemas = {}) {
  return (req, res, next) => {
    try {
      if (schemas.params) {
        const parsed = schemas.params.parse(req.params);
        try {
          req.params = parsed;
        } catch {
          // ignore if getter
        }
        Object.assign(req.params, parsed);
      }
      if (schemas.query) {
        const parsed = schemas.query.parse(req.query);
        try {
          req.query = parsed;
        } catch {
          // ignore if getter
        }
        Object.assign(req.query, parsed);
      }
      if (schemas.body) {
        req.body = schemas.body.parse(req.body);
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}

module.exports = validate;

