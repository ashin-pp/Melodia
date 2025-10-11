const Product = require('../../model/productSchema');
const Category = require('../../model/categorySchema');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const Variant = require('../../model/variantSchema');
const { promisify } = require('util');
const unlinkAsync = promisify(fs.unlink);
const { uploadBufferToCloudinary } = require('../../helper/cloudinaryUploadHelper');


exports.getProducts = async (req, res) => {
  try {
    // Session handling
    const productJustAdded = req.session.productAdded ? req.session.productAdded : false;
    delete req.session.productAdded;
    const productJustEditted = req.session.productEddited ? req.session.productEddited : false;
    delete req.session.productEddited;
    const imageWarning = req.session.imageWarning ? req.session.imageWarning : null;
    delete req.session.imageWarning;


    const { q, status, category, sort, page = 1 } = req.query;
    const limit = 10;

    console.log(' Query parameters received:', {
      q, status, category, sort, page
    });


    const filter = {};


    if (q && q.trim()) {
      filter.$or = [
        { productName: { $regex: q.trim(), $options: 'i' } },
        { brand: { $regex: q.trim(), $options: 'i' } }
      ];
    }


    if (status) {
      if (status === 'listed') {
        filter.isListed = true;
      } else if (status === 'unlisted') {
        filter.isListed = false;
      }
    }


    if (category && category !== '') {
      filter.categoryId = category;
    }

    console.log(' Final filter object:', filter);


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




    const products = await Product.find(filter)
      .sort(sortObj)
      .skip(skip)
      .limit(limit)
      .populate('categoryId', 'name')
      .populate('variants');


    const categories = await Category.find({ isListed: true }).sort({ name: 1 });
    const countCategories = await


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
        productJustAdded,
        imageWarning
      });

  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).render('error/500', {
      title: 'Server Error',
      message: 'Failed to load products'
    });
  }
};


exports.toggleProductStatus = async (req, res) => {
  try {
    const productId = req.params.id;

    console.log(' Toggling status for product:', productId);

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
    console.error('Toggle error:', error);
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
  const { productName, description, brand, categoryId, offer, type, batteryHealth } = req.body;
  let { variants } = req.body;

  console.log("===  PRODUCT DEBUG ===");
  console.log("Body:", req.body);
  console.log("Battery Health received:", batteryHealth, "Type:", typeof batteryHealth);
  console.log("Offer received:", offer, "Type:", typeof offer);
  console.log("Variants:", variants);
  console.log("Files:", req.files ? req.files.length : 0);
  if (req.files && req.files.length > 0) {
    console.log("File details:");
    req.files.forEach((file, i) => {
      console.log(`  File ${i}: ${file.fieldname} - ${file.originalname} - ${file.size} bytes`);
    });
  }
  console.log("========================");

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

  // Validate numeric fields
  if (offer && (isNaN(Number(offer)) || Number(offer) < 0 || Number(offer) > 100)) {
    errors.push('Offer must be a number between 0 and 100.');
  }



  // Simplified validation - just check if we have variants
  if (!variants || variants.length === 0) {
    errors.push('At least one variant is required.');
  } else {
    console.log('Validating variants:', variants);

    variants.forEach((v, i) => {
      console.log(`Validating variant ${i}:`, v);

      if (!v.color || !v.color.trim()) {
        errors.push(`Variant ${i + 1}: Color is required.`);
      }
      if (!v.price || isNaN(Number(v.price)) || Number(v.price) < 0) {
        errors.push(`Variant ${i + 1}: Price must be a positive number.`);
      }
      // Make stock optional
      if (v.stock && (isNaN(Number(v.stock)) || Number(v.stock) < 0)) {
        errors.push(`Variant ${i + 1}: Stock must be a positive number.`);
      }
    });
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
    // Create product first (without images)
    // Validate and sanitize numeric fields
    let sanitizedBatteryHealth = 100; // Default value
    if (batteryHealth && batteryHealth.trim() !== '') {
      const batteryNum = Number(batteryHealth);
      if (!isNaN(batteryNum)) {
        sanitizedBatteryHealth = batteryNum;
      }
    }

    const sanitizedOffer = offer && !isNaN(Number(offer)) ? Number(offer) : 0;

    console.log('Sanitized values:', {
      batteryHealth: sanitizedBatteryHealth,
      batteryHealthType: typeof sanitizedBatteryHealth,
      offer: sanitizedOffer,
      offerType: typeof sanitizedOffer
    });

    console.log('Creating product with data:', {
      productName: productName.trim(),
      brand: brand.trim(),
      categoryId,
      type: type || 'Not specified',
      batteryHealth: sanitizedBatteryHealth,
      offer: sanitizedOffer
    });

    const productData = {
      productName: productName.trim(),
      description: description.trim(),
      brand: brand.trim(),
      categoryId,
      offer: sanitizedOffer,
      isListed: true,
      variants: [],
    };

    // Only add optional fields if they have valid values
    if (type && type.trim()) {
      productData.type = type.trim();
    }

    // Always add batteryHealth since we have a valid number
    productData.batteryHealth = sanitizedBatteryHealth;

    const product = new Product(productData);

    await product.save();
    console.log('Product created successfully:', product._id);

    const createdVariants = [];

    // Process variants with images
    for (let i = 0; i < variants.length; i++) {
      const v = variants[i];

      try {
        console.log(`Creating variant ${i}:`, {
          color: v.color,
          price: v.price,
          stock: v.stock
        });

        // Handle variant images
        const variantImages = req.files ? req.files.filter(file =>
          file.fieldname === `variants[${i}][images]`
        ) : [];

        console.log(`Variant ${i} has ${variantImages.length} images`);

        let imagePaths = [];
        if (variantImages.length > 0) {
          console.log(`Uploading ${variantImages.length} images for variant ${i}`);

          const uploads = await Promise.all(
            variantImages.map(file =>
              uploadBufferToCloudinary(file.buffer, 'melodia/variants')
            )
          );

          imagePaths = uploads.map(u => ({
            url: u.secure_url,
            publicId: u.public_id
          }));

          console.log(`Successfully uploaded ${imagePaths.length} images for variant ${i}`);
        }

        // Calculate sale price based on offers
        const regularPrice = Number(v.price);
        const productOffer = sanitizedOffer;

        // For now, we'll use product offer (category offer can be added later)
        const salePrice = productOffer > 0
          ? parseFloat((regularPrice * (1 - (productOffer / 100))).toFixed(2))
          : regularPrice;

        const variantDoc = new Variant({
          productId: product._id,
          color: v.color.trim(),
          regularPrice: regularPrice,
          salePrice: salePrice,
          stock: v.stock ? Number(v.stock) : 0,
          images: imagePaths,
        });

        await variantDoc.save({ validateBeforeSave: false }); // Skip pre-save to avoid double calculation

        console.log(`Created variant ${v.color}: Regular ₹${regularPrice}, Sale ₹${salePrice} (${productOffer}% off) with ${imagePaths.length} images`);
        createdVariants.push(variantDoc._id);

        console.log(`Variant ${i} created successfully:`, variantDoc._id);

      } catch (variantError) {
        console.error(`Error creating variant ${i}:`, variantError);
        console.error('Variant error details:', variantError.message);
        throw new Error(`Failed to create variant ${i + 1}: ${variantError.message}`);
      }
    }

    console.log("variants-->", createdVariants);

    product.variants = createdVariants;
    await product.save();

    req.session.productAdded = true;

    // Check if any variants have no images and set a warning
    const variantsWithoutImages = createdVariants.length > 0 ?
      await Variant.find({
        _id: { $in: createdVariants },
        $or: [
          { images: { $exists: false } },
          { images: { $size: 0 } }
        ]
      }) : [];

    if (variantsWithoutImages.length > 0) {
      req.session.imageWarning = `Product added successfully! Note: ${variantsWithoutImages.length} variant(s) have no images. Consider editing the product to add images.`;
    }

    req.session.save((err) => {
      if (err) {
        console.log("server error while add product", err);
      }
      console.log("addProduct session saved");
    });
    res.redirect('/admin/products');
  } catch (error) {
    console.error('Error adding product:', error);

    // More specific error messages
    let errorMessage = 'Server error, please try again.';
    if (error.message.includes('variant')) {
      errorMessage = error.message;
    } else if (error.message.includes('validation')) {
      errorMessage = 'Validation error: Please check all required fields.';
    } else if (error.message.includes('Cloudinary')) {
      errorMessage = 'Image upload failed. Please try again.';
    }

    try {
      const categories = await Category.find({ isListed: true }).sort({ name: 1 });
      res.render('admin/addproduct', {
        categories,
        errors: [errorMessage],
        old: req.body
      });
    } catch (dbError) {
      console.error('Database error:', dbError);
      res.status(500).render('error/500', { title: 'Server Error' });
    }
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

    console.log('Product data for edit:', {
      id: product._id,
      name: product.productName,
      variants: product.variants.length,
      type: product.type,
      batteryHealth: product.batteryHealth
    });

    res.render('admin/editProduct', {
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
    const { productName, brand, categoryId, description, offer, isListed, type, batteryHealth, deletedImages } = req.body;
    let { variants } = req.body;

    console.log("Edit variants--->", variants);
    console.log("Edit files--->", req.files);

    if (variants && !Array.isArray(variants)) {
      if (typeof variants === 'object' && variants !== null) {
        variants = [variants];
      } else {
        variants = [];
      }
    }

    const errors = [];

    if (!productName || !productName.trim()) errors.push('Product name is required.');
    if (!brand || !brand.trim()) errors.push('Brand is required.');
    if (!categoryId) errors.push('Category is required.');
    if (!description || !description.trim()) errors.push('Description is required.');

    if (!variants || variants.length === 0) {
      errors.push('At least one variant is required.');
    } else {
      variants.forEach((v, i) => {
        if (!v.color || !v.color.trim()) {
          errors.push(`Variant ${i + 1}: Color is required.`);
        }
        if (!v.price || isNaN(v.price) || v.price < 0) {
          errors.push(`Variant ${i + 1}: Price must be a positive number.`);
        }
        if (v.stock && (isNaN(v.stock) || v.stock < 0)) {
          errors.push(`Variant ${i + 1}: Stock must be a positive number.`);
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
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors
      });
    }

    // Validate battery health
    let sanitizedBatteryHealthEdit = 100; // Default value
    if (batteryHealth && batteryHealth.trim() !== '') {
      const batteryNum = Number(batteryHealth);
      if (!isNaN(batteryNum)) {
        sanitizedBatteryHealthEdit = batteryNum;
      }
    }

    // Update product basic info
    const updateData = {
      productName: productName.trim(),
      brand: brand.trim(),
      categoryId,
      description: description.trim(),
      type: type || undefined,
      batteryHealth: sanitizedBatteryHealthEdit,
      offer: offer ? Number(offer) : 0,
      isListed: isListed === 'true',
    };

    const updatedProduct = await Product.findByIdAndUpdate(id, updateData, { new: true });

    // Handle deleted images
    let parsedDeletedImages = [];
    if (deletedImages) {
      try {
        parsedDeletedImages = JSON.parse(deletedImages);
        console.log('Parsed deleted images:', parsedDeletedImages);
      } catch (e) {
        console.error('Error parsing deleted images:', e);
      }
    }

    // Remove deleted images from variants
    if (parsedDeletedImages.length > 0) {
      for (const deleteInfo of parsedDeletedImages) {
        try {
          const variant = await Variant.findById(deleteInfo.variantId);
          if (variant && variant.images && variant.images.length > deleteInfo.imageIndex) {
            console.log(`Removing image ${deleteInfo.imageIndex} from variant ${deleteInfo.variantId}`);
            console.log('Before removal:', variant.images.length, 'images');

            // Remove the image from the array
            variant.images.splice(deleteInfo.imageIndex, 1);
            await variant.save();

            console.log('After removal:', variant.images.length, 'images');
          }
        } catch (error) {
          console.error('Error removing image:', error);
        }
      }
    }

    const finalVariantIds = [];

    // Process each variant
    for (let i = 0; i < variants.length; i++) {
      const v = variants[i];

      if (v._id) {
        // Update existing variant
        const updateVariantData = {
          color: v.color.trim(),
          regularPrice: Number(v.price),
          stock: v.stock ? Number(v.stock) : 0,
        };

        // Check for new images for this variant
        const variantNewImages = req.files ? req.files.filter(file =>
          file.fieldname === `variants[${i}][newImages]`
        ) : [];

        if (variantNewImages.length > 0) {
          // Upload new images to Cloudinary
          const uploads = await Promise.all(
            variantNewImages.map(file =>
              uploadBufferToCloudinary(file.buffer, 'melodia/variants')
            )
          );

          const newImagePaths = uploads.map(u => ({
            url: u.secure_url,
            publicId: u.public_id
          }));

          // Get existing images and add new ones
          const existingVariant = await Variant.findById(v._id);
          updateVariantData.images = [...existingVariant.images, ...newImagePaths];
        }

        await Variant.findByIdAndUpdate(v._id, updateVariantData);
        finalVariantIds.push(v._id);
      } else {
        // Create new variant
        const variantImages = req.files ? req.files.filter(file =>
          file.fieldname === `variants[${i}][images]`
        ) : [];

        let imagePaths = [];
        if (variantImages.length > 0) {
          const uploads = await Promise.all(
            variantImages.map(file =>
              uploadBufferToCloudinary(file.buffer, 'melodia/variants')
            )
          );

          imagePaths = uploads.map(u => ({
            url: u.secure_url,
            publicId: u.public_id
          }));
        }

        const newVariant = new Variant({
          productId: id,
          color: v.color.trim(),
          regularPrice: Number(v.price),
          stock: v.stock ? Number(v.stock) : 0,
          images: imagePaths,
        });

        await newVariant.save();
        finalVariantIds.push(newVariant._id);
      }
    }

    // Update product variants
    updatedProduct.variants = finalVariantIds;
    await updatedProduct.save();

    // Recalculate variant prices if offer changed
    if (offer !== undefined) {
      console.log('Offer changed, recalculating variant prices...');
      await updatedProduct.updateVariantPrices();
    }

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
