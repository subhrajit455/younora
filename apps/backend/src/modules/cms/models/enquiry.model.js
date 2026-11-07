const mongoose = require('mongoose');

const enquirySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Contact name is required'],
      trim: true,
    },
    email: {
      type: String,
      required: [true, 'Contact email is required'],
      lowercase: true,
      trim: true,
    },
    phone: {
      type: String,
      trim: true,
      default: '',
    },
    subject: {
      type: String,
      trim: true,
      default: 'General Enquiry',
    },
    message: {
      type: String,
      required: [true, 'Enquiry message is required'],
      trim: true,
    },
    status: {
      type: String,
      enum: ['NEW', 'REPLIED', 'CLOSED'],
      default: 'NEW',
      index: true,
    },
    reply: {
      text: { type: String, trim: true, default: null },
      repliedAt: { type: Date, default: null },
      repliedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'AdminUser', default: null },
    },
  },
  {
    timestamps: true,
    collection: 'enquiries',
  }
);

const Enquiry = mongoose.models.Enquiry || mongoose.model('Enquiry', enquirySchema);

module.exports = Enquiry;

