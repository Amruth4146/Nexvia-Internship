import mongoose from 'mongoose';

const productSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Please provide product title'],
      trim: true,
      maxlength: [200, 'Title cannot exceed 200 characters'],
    },
    slug: {
      type: String,
      unique: true,
      lowercase: true,
      trim: true,
    },
    description: {
      type: String,
      required: [true, 'Please provide product description'],
    },
    vendorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User', // References vendor's User account
      required: [true, 'Product must belong to a vendor'],
      index: true,
    },
    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      required: [true, 'Product must belong to a category'],
      index: true,
    },
    price: {
      type: Number,
      required: [true, 'Please provide price in INR (₹)'],
      min: [0, 'Price must be positive'],
    },
    discountPrice: {
      type: Number,
      default: null,
      min: [0, 'Discount price must be positive'],
    },
    stock: {
      type: Number,
      required: [true, 'Please provide stock quantity'],
      min: [0, 'Stock cannot be negative'],
      default: 0,
    },
    sku: {
      type: String,
      required: [true, 'Please provide SKU identifier'],
      unique: true,
      uppercase: true,
      trim: true,
    },
    gstRate: {
      type: Number,
      enum: [0, 5, 12, 18, 28],
      default: 18,
    },
    images: {
      type: [String],
      validate: {
        validator: function (v) {
          return Array.isArray(v) && v.length > 0;
        },
        message: 'Product must have at least one image',
      },
    },
    brand: {
      type: String,
      default: '',
      trim: true,
    },
    attributes: {
      type: Map,
      of: String,
      default: {},
    },
    averageRating: {
      type: Number,
      default: 0,
      min: [0, 'Rating cannot be less than 0'],
      max: [5, 'Rating cannot be greater than 5'],
    },
    reviewCount: {
      type: Number,
      default: 0,
    },
    isFeatured: {
      type: Boolean,
      default: false,
      index: true,
    },
    status: {
      type: String,
      enum: ['draft', 'published', 'archived'],
      default: 'published',
      index: true,
    },
    appliedMutations: {
      type: [String],
      default: [],
      select: false,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Virtual alias sellerId -> vendorId for backward compatibility
productSchema.virtual('sellerId').get(function () {
  return this.vendorId;
});

// Indexes for fast searching and filtering
productSchema.index({ title: 'text', description: 'text', brand: 'text' });
productSchema.index({ categoryId: 1, status: 1, price: 1 });
productSchema.index({ vendorId: 1, status: 1 });
productSchema.index({ status: 1, averageRating: -1 });
productSchema.index({ appliedMutations: 1 });

// Auto-generate slug from title
productSchema.pre('save', function (next) {
  if (this.isModified('title') && !this.slug) {
    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    this.slug =
      this.title
        .toLowerCase()
        .replace(/[^\w\s-]/g, '')
        .replace(/[\s_-]+/g, '-')
        .replace(/^-+|-+$/g, '') +
      '-' +
      randomSuffix;
  }
  next();
});

export const Product = mongoose.model('Product', productSchema);
