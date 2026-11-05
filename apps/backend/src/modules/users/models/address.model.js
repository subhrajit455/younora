const mongoose = require('mongoose');
const { ADDRESS_TYPE } = require('@younora/shared-constants');

const addressSchema = new mongoose.Schema(
  {
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Customer',
      required: [true, 'Customer reference is required'],
      index: true,
    },
    name: {
      type: String,
      required: [true, 'Contact name is required'],
      trim: true,
      maxlength: [100, 'Name cannot exceed 100 characters'],
    },
    phone: {
      type: String,
      required: [true, 'Phone number is required'],
      trim: true,
      match: [/^[6-9]\d{9}$/, 'Please enter a valid 10-digit Indian phone number'],
    },
    line1: {
      type: String,
      required: [true, 'Address line 1 is required'],
      trim: true,
      maxlength: [200, 'Line 1 cannot exceed 200 characters'],
    },
    line2: {
      type: String,
      trim: true,
      maxlength: [200, 'Line 2 cannot exceed 200 characters'],
    },
    landmark: {
      type: String,
      trim: true,
      maxlength: [100, 'Landmark cannot exceed 100 characters'],
    },
    city: {
      type: String,
      required: [true, 'City is required'],
      trim: true,
      maxlength: [100, 'City cannot exceed 100 characters'],
    },
    state: {
      type: String,
      required: [true, 'State is required'],
      trim: true,
      maxlength: [100, 'State cannot exceed 100 characters'],
    },
    pincode: {
      type: String,
      required: [true, 'Pincode is required'],
      trim: true,
      match: [/^[1-9][0-9]{5}$/, 'Please enter a valid 6-digit Indian PIN code'],
    },
    country: {
      type: String,
      default: 'IN',
      uppercase: true,
    },
    type: {
      type: String,
      enum: Object.values(ADDRESS_TYPE),
      default: ADDRESS_TYPE.HOME,
    },
    isDefault: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  {
    timestamps: true,
    collection: 'addresses',
  }
);

// Compound index to quickly fetch customer's addresses
addressSchema.index({ customer: 1, createdAt: -1 });

const Address = mongoose.model('Address', addressSchema);

module.exports = Address;

