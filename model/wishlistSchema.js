import mongoose from 'mongoose';

const wishlistItemSchema = new mongoose.Schema({
  variantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Variant',
    required: true
  },
  addedAt: {
    type: Date,
    default: Date.now
  }
});

const wishlistSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  items: [wishlistItemSchema],
  wishlistName: {
    type: String,
    default: 'My Wishlist'
  },
  description: {
    type: String,
    default: ''
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

// Update the updatedAt field before saving
wishlistSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Method to check if item exists in wishlist
wishlistSchema.methods.hasItem = function(variantId) {
  return this.items.some(item => item.variantId.toString() === variantId.toString());
};

// Method to remove item from wishlist
wishlistSchema.methods.removeItem = async function(variantId) {
  this.items = this.items.filter(item => item.variantId.toString() !== variantId.toString());
  return await this.save();
};

// Method to get total items in wishlist
wishlistSchema.methods.getTotalItems = function() {
  return this.items.length;
};



const Wishlist = mongoose.model('Wishlist', wishlistSchema);
export default Wishlist;