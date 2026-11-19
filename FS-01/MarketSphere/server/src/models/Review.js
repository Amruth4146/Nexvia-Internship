import mongoose from 'mongoose';

const reviewSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
      index: true,
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    rating: {
      type: Number,
      required: [true, 'Please provide a rating between 1 and 5'],
      min: 1,
      max: 5,
    },
    comment: {
      type: String,
      required: [true, 'Please provide review comment'],
      trim: true,
      maxlength: [1000, 'Comment cannot exceed 1000 characters'],
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Virtual alias buyerId -> customerId
reviewSchema.virtual('buyerId').get(function () {
  return this.customerId;
});

// Prevent customer from submitting multiple reviews for same product
reviewSchema.index({ productId: 1, customerId: 1 }, { unique: true });

// Static method to recalculate product rating average
reviewSchema.statics.calculateAverageRating = async function (productId) {
  const stats = await this.aggregate([
    { $match: { productId } },
    {
      $group: {
        _id: '$productId',
        ratingCount: { $sum: 1 },
        avgRating: { $avg: '$rating' },
      },
    },
  ]);

  try {
    if (stats.length > 0) {
      await mongoose.model('Product').findByIdAndUpdate(productId, {
        averageRating: Math.round(stats[0].avgRating * 10) / 10,
        reviewCount: stats[0].ratingCount,
      });
    } else {
      await mongoose.model('Product').findByIdAndUpdate(productId, {
        averageRating: 0,
        reviewCount: 0,
      });
    }
  } catch (err) {
    console.error(`Error updating product review stats: ${err.message}`);
  }
};

reviewSchema.post('save', async function () {
  await this.constructor.calculateAverageRating(this.productId);
});

export const Review = mongoose.model('Review', reviewSchema);
