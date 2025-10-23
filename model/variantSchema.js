import mongoose from 'mongoose';

const variantSchema = new mongoose.Schema({
  productId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Product', 
    required: true 
  },
  color: {
    type: String,
    required: true
  },
  images: {
    type: [mongoose.Schema.Types.Mixed], 
    default: []
  },
  regularPrice: { 
    type: Number, 
    required: true, 
    min: 0 
  },
  salePrice: { 
    type: Number,  
    min: 0
  },
  stock: { 
    type: Number, 
    required: true, 
    min: 0 
  }
}, { timestamps: true });

// Calculate sale price before saving
variantSchema.pre('save', async function(next) {
  try {
    // Get the product to check for offers
    const Product = mongoose.model('Product');
    const product = await Product.findById(this.productId).populate('categoryId');
    
    if (product) {
      // Get the best offer (product offer or category offer)
      const productOffer = product.offer || 0;
      const categoryOffer = product.categoryId?.offer || 0;
      const bestOffer = Math.max(productOffer, categoryOffer);
      
      // Calculate sale price with discount
      if (bestOffer > 0) {
        this.salePrice = parseFloat(
          (this.regularPrice * (1 - (bestOffer / 100))).toFixed(2)
        );
      } else {
        this.salePrice = this.regularPrice;
      }
      
      console.log(`Variant ${this.color}: Regular ₹${this.regularPrice}, Sale ₹${this.salePrice} (${bestOffer}% off)`);
    } else {
      this.salePrice = this.regularPrice;
    }
    
    next();
  } catch (error) {
    console.error('Error calculating sale price:', error);
    this.salePrice = this.regularPrice;
    next();
  }
});

// Add compound index for efficient querying
variantSchema.index({ productId: 1, color: 1 }, { unique: true });

const Variant = mongoose.model('Variant', variantSchema);
export default Variant;
