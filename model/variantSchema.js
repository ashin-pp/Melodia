const mongoose = require('mongoose');

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
    required: true
  },
  regularPrice: { 
    type: Number, 
    required: true, 
    min: 0 
  },
  salePrice: { 
    type: Number,  
    min: 0,
    default: function() {
      return this.regularPrice; // Default to regular price
    }
  },
  stock: { 
    type: Number, 
    required: true, 
    min: 0 
  }
}, { timestamps: true });

// Add compound index for efficient querying
variantSchema.index({ productId: 1, color: 1 }, { unique: true });

const Variant = mongoose.model('Variant', variantSchema);
module.exports = Variant;
