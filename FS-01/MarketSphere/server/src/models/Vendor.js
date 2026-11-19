import mongoose from 'mongoose';

const bankDetailsSchema = new mongoose.Schema(
  {
    accountHolderName: { type: String, trim: true },
    accountNumber: { type: String, trim: true },
    ifscCode: {
      type: String,
      uppercase: true,
      trim: true,
      match: [/^[A-Z]{4}0[A-Z0-9]{6}$/, 'Please provide a valid Indian IFSC code'],
    },
    bankName: { type: String, trim: true },
    branch: { type: String, trim: true },
  },
  { _id: false }
);

const vendorAddressSchema = new mongoose.Schema(
  {
    street: { type: String, required: true },
    city: { type: String, required: true },
    state: { type: String, required: true },
    postalCode: {
      type: String,
      required: true,
      match: [/^[1-9][0-9]{5}$/, 'Please provide a valid 6-digit Indian PIN code'],
    },
    country: { type: String, default: 'India' },
  },
  { _id: false }
);

const vendorSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    businessName: {
      type: String,
      required: [true, 'Please provide business name'],
      trim: true,
      maxlength: [120, 'Business name cannot exceed 120 characters'],
    },
    storeSlug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    description: {
      type: String,
      default: '',
    },
    logo: {
      type: String,
      default: '',
    },
    banner: {
      type: String,
      default: '',
    },
    gstin: {
      type: String,
      uppercase: true,
      trim: true,
      match: [
        /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/,
        'Please provide a valid 15-character Indian GSTIN',
      ],
    },
    pan: {
      type: String,
      uppercase: true,
      trim: true,
      match: [/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/, 'Please provide a valid 10-character Indian PAN'],
    },
    bankDetails: bankDetailsSchema,
    address: vendorAddressSchema,
    commissionRate: {
      type: Number,
      default: 10.0,
      min: [0, 'Commission cannot be negative'],
      max: [50, 'Commission cannot exceed 50%'],
    },
    rating: {
      type: Number,
      default: 0,
      min: 0,
      max: 5,
    },
    ratingCount: {
      type: Number,
      default: 0,
    },
    isVerified: {
      type: Boolean,
      default: false,
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'suspended', 'rejected'],
      default: 'approved', // auto-approved for dev seed, controllable by admin
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Auto-generate storeSlug from businessName
vendorSchema.pre('validate', function (next) {
  if (this.businessName && !this.storeSlug) {
    this.storeSlug = this.businessName
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }
  next();
});

export const Vendor = mongoose.model('Vendor', vendorSchema);
