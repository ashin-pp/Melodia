import mongoose from 'mongoose';

const cartItemSchema = new mongoose.Schema({
  variantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Variant',
    required: true
  },
  quantity: {
    type: Number,
    required: true,
    min: 1,
    default: 1
  },
  addedAt: {
    type: Date,
    default: Date.now
  }
});

const cartSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  items: [cartItemSchema],
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

// Update the updatedAt field before saving
cartSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Method to calculate total items in cart
cartSchema.methods.getTotalItems = function() {
  return this.items.reduce((total, item) => total + item.quantity, 0);
};

// Method to calculate total price
cartSchema.methods.getTotalPrice = async function() {
  await this.populate({
    path: 'items.variantId',
    populate: {
      path: 'productId',
      populate: {
        path: 'categoryId'
      }
    }
  });

  let total = 0;
  for (const item of this.items) {
    if (item.variantId && item.variantId.salePrice) {
      total += item.variantId.salePrice * item.quantity;
    }
  }
  return parseFloat(total.toFixed(2));
};

// Method to check if cart has valid items (not blocked/unlisted)
cartSchema.methods.getValidItems = async function() {
  await this.populate({
    path: 'items.variantId',
    populate: {
      path: 'productId',
      populate: {
        path: 'categoryId'
      }
    }
  });

  return this.items.filter(item => {
    const variant = item.variantId;
    const product = variant?.productId;
    const category = product?.categoryId;
    
    return variant && 
           variant.stock > 0 && 
           product && 
           product.isListed && 
           category && 
           category.isListed;
  });
};

const Cart = mongoose.model('Cart', cartSchema);
export default Cart;