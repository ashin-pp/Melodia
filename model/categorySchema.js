import mongoose from 'mongoose';

const categorySchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true, 
    trim: true
  },
  description: {
    type: String,
    default: ''
  },
  offer: {
  type: Number,
  default: 0,
  min: 0,
  max: 100
},
  isListed: {
    type: Boolean,
    default: true 
  }
}, {
  timestamps: true 
});




// categoryModel.js
categorySchema.methods.getEffectiveDiscount = function(productOffer = 0) {
  return Math.max(this.offer, productOffer); // Returns the higher discount
};
// Function to recalculate prices for all products in this category
async function recalculateCategoryPrices(category) {
  try {
    const Product = mongoose.model('Product');
    const Variant = mongoose.model('Variant');
    
    console.log(`Recalculating prices for category: ${category.name} (${category.offer}% offer)`);
    
    // Find all products in this category
    const products = await Product.find({ categoryId: category._id });
    
    // Prepare bulk write operations
    const bulkOps = [];
    
    for (const product of products) {
      const effectiveDiscount = category.getEffectiveDiscount(product.offer);
      
      // Get all variants for this product
      const variants = await Variant.find({ productId: product._id });
      
      variants.forEach(variant => {
        const salePrice = effectiveDiscount > 0
          ? parseFloat((variant.regularPrice * (1 - (effectiveDiscount / 100))).toFixed(2))
          : variant.regularPrice;
        
        bulkOps.push({
          updateOne: {
            filter: { _id: variant._id },
            update: { $set: { salePrice } }
          }
        });
      });
    }
    
    // Execute all updates in a single operation
    if (bulkOps.length > 0) {
      await Variant.bulkWrite(bulkOps);
      console.log(`Updated ${bulkOps.length} variants for category ${category.name}`);
    }
  } catch (error) {
    console.error('Error recalculating category prices:', error);
  }
}

// Hook for category updates
categorySchema.post('findOneAndUpdate', async function(category) {
  if (category) {
    await recalculateCategoryPrices(category);
  }
});

// Hook for category creation (in case offer is set during creation)
categorySchema.post('save', async function(category) {
  if (category.offer > 0) {
    await recalculateCategoryPrices(category);
  }
});
export default mongoose.model('Category', categorySchema);
