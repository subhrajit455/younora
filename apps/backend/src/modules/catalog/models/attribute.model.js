const mongoose = require('mongoose');
const { ATTRIBUTE_TYPE } = require('@younora/shared-constants');

const attributeSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      required: [true, 'Attribute type is required'],
      enum: {
        values: Object.values(ATTRIBUTE_TYPE),
        message: 'Invalid attribute type: {VALUE}',
      },
      uppercase: true,
      index: true,
    },
    name: {
      type: String,
      required: [true, 'Attribute name is required'],
      trim: true,
    },
    value: {
      type: String,
      trim: true,
      default: '',
    },
    sortOrder: {
      type: Number,
      default: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

attributeSchema.index({ type: 1, name: 1 }, { unique: true });
attributeSchema.index({ type: 1, sortOrder: 1, createdAt: 1 });

const Attribute = mongoose.models.Attribute || mongoose.model('Attribute', attributeSchema);

module.exports = Attribute;

