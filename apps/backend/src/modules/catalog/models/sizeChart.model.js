const mongoose = require('mongoose');
const { SIZE_CHART_UNIT } = require('@younora/shared-constants');

const sizeChartRowSchema = new mongoose.Schema(
  {
    size: {
      type: String,
      required: [true, 'Size label is required for row'],
      trim: true,
    },
    values: {
      type: Map,
      of: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { _id: false }
);

const sizeChartSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Size chart name is required'],
      trim: true,
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      default: null,
      index: true,
    },
    unit: {
      type: String,
      enum: {
        values: Object.values(SIZE_CHART_UNIT),
        message: 'Invalid size chart unit: {VALUE}',
      },
      default: SIZE_CHART_UNIT.INCH,
    },
    columns: {
      type: [String],
      required: [true, 'Size chart columns are required'],
      validate: {
        validator: function (cols) {
          return Array.isArray(cols) && cols.length > 0;
        },
        message: 'Size chart must have at least one column',
      },
    },
    rows: {
      type: [sizeChartRowSchema],
      default: [],
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

sizeChartSchema.index({ category: 1, isDeleted: 1 });
sizeChartSchema.index({ name: 1, isDeleted: 1 });

const SizeChart = mongoose.models.SizeChart || mongoose.model('SizeChart', sizeChartSchema);

module.exports = SizeChart;

