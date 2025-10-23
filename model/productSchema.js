import mongoose from 'mongoose';

const productSchema = new mongoose.Schema({
  productName: { type: String, required: true },
  description: { type: String, required: true },
  categoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
  brand: { type: String, required: true },
  type: { type: String, enum: ['Wireless', 'Wired', 'Gaming'] },
  batteryHealth: { type: Number, default: 100 },
  offer: { type: Number, default: 0, min: 0, max: 100 },
  isListed: { type: Boolean, default: true },
  variants: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Variant' }]
}, { timestamps: true });


productSchema.methods.updateVariantPrices = async function () {
  const product = this.populated('categoryId') || await this.populate('categoryId');
  const Variant = mongoose.model('Variant');

  const variants = await Variant.find({ productId: product._id });

  // Get the best offer (product or category)
  const productOffer = product.offer || 0;
  const categoryOffer = product.categoryId?.offer || 0;
  const bestOffer = Math.max(productOffer, categoryOffer);

  console.log(`Updating prices for ${variants.length} variants with ${bestOffer}% discount`);

  await Promise.all(
    variants.map(async variant => {
      const newSalePrice = bestOffer > 0
        ? parseFloat((variant.regularPrice * (1 - (bestOffer / 100))).toFixed(2))
        : variant.regularPrice;

      if (variant.salePrice !== newSalePrice) {
        variant.salePrice = newSalePrice;
        await variant.save({ validateBeforeSave: false }); // Skip pre-save to avoid recursion
        console.log(`Updated ${variant.color}: ₹${variant.regularPrice} → ₹${newSalePrice}`);
      }
    })
  );
};

productSchema.pre('save', async function (next) {
  if (this.variants?.length > 0 || this.isModified("offer")) {
    try {
      await this.updateVariantPrices();
    } catch (err) {
      console.error('Variant price update failed:', err);
    }
  }
  next();
});

export default mongoose.model('Product', productSchema);