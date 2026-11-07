const inventoryService = require('./inventory.service');
const { sendSuccess } = require('../../core/http/response');

class StoreBatchController {
  async getPublicBatch(req, res, next) {
    try {
      const data = await inventoryService.getPublicBatchByNo(req.params.batchNo);
      return sendSuccess(res, {
        message: 'Batch authenticity verified',
        data,
      });
    } catch (err) {
      return next(err);
    }
  }
}

module.exports = new StoreBatchController();

