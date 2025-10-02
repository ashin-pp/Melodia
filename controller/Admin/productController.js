const Product = require('../../model/productSchema');
const Category = require('../../model/categorySchema');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const Variant = require('../../model/variantSchema');
const { promisify } = require('util');
const unlinkAsync = promisify(fs.unlink);
const { uploadBufferToCloudinary } = require('../../helper/cloudinaryUploadHelper');

// ✅ FIXED: Enhanced getProducts with filtering functionality
exports.getProducts = async (req, res) => {
  try {
    // Session handling
    const productJustAdded = req.session.productAdded ? req.session.productAdded : false;
    delete req.session.productAdded;
    const productJustEditted = req.session.productEddited ? req.session.productEddited : false;
    delete req.session.productEddited;

    // ✅ Extract all query parameters
    const { q, status, category, sort, page = 1 } = req.query;
    const limit = 10; // Increased from 5 for better pagination

    console.log('🔍 Query parameters received:', {
      q, status, category, sort, page
    });

    // ✅ Build comprehensive filter object
    const filter = {};
    
    // Search filter (existing functionality)
    if (q && q.trim()) {
      filter.$or = [
        { productName: { $regex: q.trim(), $options: 'i' } },
        { brand: { $regex: q.trim(), $options: 'i' } }
      ];
    }

    // ✅ NEW: Status filter (listed/unlisted)
    if (status) {
      if (status === 'listed') {
        filter.isListed = true;
      } else if (status === 'unlisted') {
        filter.isListed = false;
      }
    }

    // ✅ NEW: Category filter
    if (category && category !== '') {
      filter.categoryId = category;
    }

    console.log('📝 Final filter object:', filter);

    // ✅ Build sort object
    let sortObj = { createdAt: -1 }; // Default: newest first
    
    switch (sort) {
      case 'oldest':
        sortObj = { createdAt: 1 };
        break;
      case 'name':
        sortObj = { productName: 1 };
        break;
      case 'name_desc':
        sortObj = { productName: -1 };
        break;
      case 'newest':
      default:
        sortObj = { createdAt: -1 };
        break;
    }

   

    // Calculate pagination
    const skip = (parseInt(page) - 1) * limit;
    
    // Get total count for pagination
    const totalProducts = await Product.countDocuments(filter);
    const totalPages = Math.ceil(totalProducts / limit);

    

    // ✅ Get products with all filters applied
    const products = await Product.find(filter)
      .sort(sortObj)
      .skip(skip)
      .limit(limit)
      .populate('categoryId', 'name')
      .populate('variants');

    // ✅ Get categories for filter dropdown
    const categories = await Category.find({ isListed: true }).sort({ name: 1 });


    // ✅ Render with all required data
    res.render('admin/products', {
      products,
      categories, 
      query: q || '',
      status: status || '',
      category: category || '',
      sort: sort || 'newest',
      currentPage: parseInt(page),
      totalPages,
      totalProducts, 
      productJustEditted,
      productJustAdded
    });

  } catch (error) {
    console.error('❌ Error fetching products:', error);
    res.status(500).render('error/500', { 
      title: 'Server Error',
      message: 'Failed to load products'
    });
  }
};


exports.toggleProductStatus = async (req, res) => {
  try {
    const productId = req.params.id;
    
    console.log('🔄 Toggling status for product:', productId);
    
    // Find current product
    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ 
        success: false, 
        message: 'Product not found' 
      });
    }
    
    // Toggle the status
    const newStatus = !product.isListed;
    
    console.log('Current status:', product.isListed, '→ New status:', newStatus);
    
    // Update using updateOne for reliability
    const updateResult = await Product.updateOne(
      { _id: productId },
      { $set: { isListed: newStatus } }
    );
    
    console.log('Toggle update result:', updateResult);
    
    // Verify the update
    const updatedProduct = await Product.findById(productId);
    console.log('Verified new status:', updatedProduct.isListed);
    
    res.json({
      success: true,
      newStatus: updatedProduct.isListed ? 'Listed' : 'Unlisted',
      message: `Product ${updatedProduct.isListed ? 'listed' : 'unlisted'} successfully`
    });
    
  } catch (error) {
    console.error('❌ Toggle error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error updating product status' 
    });
  }
};

// Your existing functions remain the same...
exports.getAddProduct = async (req, res) => {
  try {
    const categories = await Category.find({ isListed: true }).sort({ name: 1 }); 
    res.render('admin/addproduct', {
      categories,
      errors: [],
      old: {} 
    });
  } catch (error) {
    console.error('Error loading add product page:', error);
    res.status(500).render('error/500', { title: 'Server Error' });
  }
};

exports.postAddProduct = async (req, res) => {
  const { productName, description, brand, categoryId, offer, isListed } = req.body;
  let { variants } = req.body;
  console.log("variants--->",variants);
  let errors = [];

  if (variants && !Array.isArray(variants)) {
    if (typeof variants === 'object' && variants !== null) {
      variants = [variants];
    } else {
      variants = [];
    }
  }

  if (!productName || !productName.trim()) errors.push('Product name is required.');
  if (!brand || !brand.trim()) errors.push('Brand is required.');
  if (!categoryId) errors.push('Category is required.');
  if (!description || !description.trim()) errors.push('Description is required.');
  
  if (!req.files || req.files.length < 3) {
    errors.push('Please upload at least 3 images.');
  }

  if (!variants || variants.length === 0 || !variants.some(v => v.color && v.price)) {
    errors.push('At least one variant (with color & price) is required.');
  } else {
    variants.forEach((v, i) => {
      if (!v.color || !v.color.trim()) {
        errors.push(`Variant ${i+1}: Color is required.`);
      }
      if (!v.price || isNaN(v.price) || v.price < 0) {
        errors.push(`Variant ${i+1}: Price must be a positive number.`);
      }
      if (v.stock && (isNaN(v.stock) || v.stock < 0)) {
        errors.push(`Variant ${i+1}: Stock must be a positive number.`);
      }
    });
  }

  if (offer !== '' && offer !== undefined && offer !== null) {
    const numOffer = Number(offer);
    if (isNaN(numOffer)) {
      errors.push("Offer must be a number.");
    } else if (numOffer < 0 || numOffer > 100) {
      errors.push("Offer must be between 0 and 100.");
    }
  }

  if (errors.length > 0) {
    const categories = await Category.find({ isListed: true }).sort({ name: 1 });
    return res.render('admin/addproduct', {
      categories,
      errors,
      old: { ...req.body, variants }
    });
  }

  try {
    const images = Array.isArray(req.files) ? req.files : (req.files ? [req.files] : []);
    console.log(images, "----> images array");

    const uploads = await Promise.all(
      images.map(file =>
        uploadBufferToCloudinary(file.buffer, 'superkicks/products') 
      )
    );

    const imagePaths = uploads.map(u => ({
      url: u.secure_url,
      publicId: u.public_id
    }));

    const product = new Product({
      productName: productName.trim(),
      description: description.trim(),
      brand: brand.trim(),
      categoryId,
      offer: offer ? Number(offer) : 0,
      images: imagePaths,
      isListed: true,
      variants: [],
    });
    await product.save();

    const createdVariants = [];
    for (const v of variants) {
      const variantDoc = new Variant({
        productId: product._id,
        color: v.color.trim(),
        regularPrice: Number(v.price),
        stock: v.stock ? Number(v.stock) : 0,
        isListed: true,
      });
      await variantDoc.save();
      createdVariants.push(variantDoc._id);
    }

    console.log("variants-->",createdVariants)
    
    product.variants = createdVariants;
    await product.save();

    req.session.productAdded = true;
    req.session.save((err)=>{
      if(err){
        console.log("server error while add product",err)
      }
      console.log("addProduct session saved")
    })
    res.redirect('/admin/products');
  } catch (error) {
    console.error('Error adding product:', error);
    const categories = await Category.find({ isListed: true }).sort({ name: 1 });
    res.render('admin/addproduct', {
      categories,
      errors: ['Server error, please try again.'],
      old: req.body
    });
  }
};

exports.getEditProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id)
      .populate('categoryId', 'name')
      .populate('variants'); 

    if (!product) {
      return res.status(404).render('error/404', { title: 'Product Not Found' });
    }

    const categories = await Category.find({ isListed: true }).sort({ name: 1 });
    console.log(product.categoryId);
    
    res.render('admin/editproduct', {
      product,
      categories,
      errors: [],
      old: {},
    });
  } catch (error) {
    console.error(error);
    res.status(500).render('error/500', { title: 'Server Error' });
  }
};

exports.postEditProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      productName,
      brand,
      categoryId,
      description,
      offer,
      isListed,
      deletedImages = '[]',
      newImages = '[]',
      variants = '[]',
      deletedVariants = '[]'   
    } = req.body;

    const parsedDeletedImages = JSON.parse(deletedImages);
    const parsedNewImages = Array.isArray(newImages) ? newImages : JSON.parse(newImages);

    const currentProduct = await Product.findById(id);
    if (!currentProduct) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    let finalImages = currentProduct.images.filter(img => {
      if (typeof img === 'string') {
        return !parsedDeletedImages.includes(img);
      } else {
        return !parsedDeletedImages.includes(img.publicId) &&
               !parsedDeletedImages.includes(img.url);
      }
    });

    if (req.files && req.files.length > 0) {
      const uploads = await Promise.all(
        req.files.map(file => uploadBufferToCloudinary(file.buffer, 'superkicks/products'))
      );
      const uploadedImages = uploads.map(u => ({
        url: u.secure_url,
        publicId: u.public_id
      }));
      finalImages = [...finalImages, ...uploadedImages];
    }

    if (parsedNewImages.length > 0) {
      finalImages = [...finalImages, ...parsedNewImages];
    }

    if (finalImages.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'At least one product image is required'
      });
    }

    // This part seems to handle local file deletion, which is not needed for Cloudinary.
    // It's safer to only handle deletion from Cloudinary.
    await Promise.all(
      parsedDeletedImages.map(async identifier => {
        if (!identifier) return;
        // Assuming 'identifier' is the public_id for Cloudinary images
        try {
          // Note: You might need to require 'cloudinary' at the top of the file.
          await cloudinary.uploader.destroy(identifier);
        } catch (err) {
          console.error('Cloudinary delete failed:', identifier, err.message);
        }
      })
    );

    let parsedVariants, parsedDeletedVariants;
    try {
      parsedVariants = Array.isArray(variants) ? variants : JSON.parse(variants);
      parsedDeletedVariants = Array.isArray(deletedVariants) ? deletedVariants : JSON.parse(deletedVariants);
    } catch (e) {
      return res.status(400).json({
        success: false,
        message: 'Invalid JSON for variants',
        errors: ['Variants data is malformed']
      });
    }

    const errors = [];

    if (!productName  || !productName.trim()) errors.push('Product name is required.');
    if (!brand        || !brand.trim())       errors.push('Brand is required.');
    if (!categoryId)                       errors.push('Category is required.');
    if (!description  || !description.trim()) errors.push('Description is required.');

    if (offer !== '' && offer != null) {
      const numOffer = Number(offer);
      if (isNaN(numOffer)) errors.push('Offer must be a number.');
      else if (numOffer < 0 || numOffer > 100) errors.push('Offer must be between 0 and 100.');
    }

    if (!Array.isArray(parsedVariants) || parsedVariants.length === 0) {
      errors.push('At least one variant is required.');
    } else {
      parsedVariants.forEach((v, i) => {
        if (!v.color || !v.color.trim()) errors.push(`Variant ${i+1}: Color is required.`);
        if (v.price == null || v.price === '' || isNaN(v.price) || v.price < 0)errors.push(`Variant ${i+1}: Price must be a non-negative number.`);
        if (v.stock != null && (isNaN(v.stock) || v.stock < 0)) errors.push(`Variant ${i+1}: Stock must be a non-negative number.`);
      });
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors
      });
    }

    if (parsedDeletedVariants.length > 0) {
      await Variant.deleteMany({ 
        _id: { $in: parsedDeletedVariants }, 
        productId: id 
      });
    }

    const finalVariantIds = [];
    for (const v of parsedVariants) {
      if (v._id) {
        await Variant.findByIdAndUpdate(v._id, {
          color: v.color.trim(),
          regularPrice: Number(v.price),
          stock: v.stock ? Number(v.stock) : 0,
          isListed: true
        });
        finalVariantIds.push(v._id);
      } else {
        const newVar = new Variant({
          productId: id,
          color: v.color.trim(),
          regularPrice: Number(v.price),
          stock: v.stock ? Number(v.stock) : 0,
          isListed: true
        });
        await newVar.save();
        finalVariantIds.push(newVar._id);
      }
    }

    const updateData = {
      productName: productName.trim(),
      brand: brand.trim(),
      categoryId,
      description: description.trim(),
      offer: Math.min(100, Math.max(0, Number(offer)) || 0),
      isListed: isListed === 'true',
      images: finalImages,
      variants: finalVariantIds  
    };

    const updatedProduct = await Product.findByIdAndUpdate(id, updateData, { new: true });

    // ✅ Fixed session variable name
    req.session.productEddited = true;
    req.session.save(err => {
      if (err) console.error("Error saving session:", err);
    });

    return res.json({
      success: true,
      message: 'Product updated successfully',
      product: updatedProduct
    });

  } catch (error) {
    console.error('Edit product error:', error);
    return res.status(500).json({
      success: false,
      message: 'An error occurred while updating the product'
    });
  }
};

exports.uploadProductImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const result = await uploadBufferToCloudinary(req.file.buffer, 'Melodia/products');

    res.json({
      url: result.secure_url,
      publicId: result.public_id
    });

  } catch (error) {
    console.error('Image upload error:', error);
    res.status(500).json({ error: 'Failed to upload image' });
  }
};
