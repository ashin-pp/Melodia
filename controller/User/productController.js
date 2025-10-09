const Product = require('../../model/productSchema');
const Category = require('../../model/categorySchema');
const Review = require('../../model/reviewSchema');
const Variant = require('../../model/variantSchema');
const mongoose = require('mongoose');
const productSchema = require('../../model/productSchema');



exports.getShop = async (req, res) => {
  try {
    console.log(' getShop called - User:', req.session?.user?.fullName || 'Not logged in');
    const q = req.query.q ? req.query.q.trim() : '';
    const category = req.query.category || '';
    const priceMin = req.query.priceMin !== undefined && req.query.priceMin !== '' ? Number(req.query.priceMin) : undefined;
    const priceMax = req.query.priceMax !== undefined && req.query.priceMax !== '' ? Number(req.query.priceMax) : undefined;
    const sort = req.query.sort || '';
    const page = parseInt(req.query.page) > 0 ? parseInt(req.query.page) : 1;
    const limit = 6;
    const skip = (page - 1) * limit;
    
    const brands = typeof req.query.brands === 'string' && req.query.brands.trim().length > 0
      ? req.query.brands.split(',').map(b => b.trim()).filter(Boolean)
      : [];

    console.log('Brand filters received:', brands);

    // Build match stage
    const matchStage = { isListed: true, };
    if (q) {
      matchStage.$or = [
        { productName: { $regex: q, $options: 'i' } },
        { brand: { $regex: q, $options: 'i' } }
      ];
    }
    if (category && mongoose.Types.ObjectId.isValid(category)) {
      matchStage.categoryId = new mongoose.Types.ObjectId(category);
    }
    // Apply brand filter if provided
    if (brands.length > 0) {
      matchStage.brand = { $in: brands };
    }

    // Main aggregation pipeline
    const pipeline = [
      { $match: matchStage },

      {
        $lookup: {
          from: 'categories',
          localField: 'categoryId',
          foreignField: '_id',
          as: 'categoryInfo'
        }
      },
      { $unwind: { path: '$categoryInfo', preserveNullAndEmptyArrays: true } },
      { $match: { 'categoryInfo.isListed': true } },
      {
        $lookup: {
          from: 'variants',
          localField: 'variants',
          foreignField: '_id',
          as: 'variantDocs'
        }
      },

      {
        $addFields: {
          // Get the best offer (product or category)
          bestOffer: {
            $max: [
              { $ifNull: ["$offer", 0] },
              { $ifNull: ["$categoryInfo.offer", 0] }
            ]
          },
          // Get lowest regular price
          lowestPrice: { $min: "$variantDocs.regularPrice" },
          // Get lowest sale price (already calculated in variant schema)
          lowestSalePrice: { $min: "$variantDocs.salePrice" }
        }
      }
    ];


    if (priceMin !== undefined || priceMax !== undefined) {
      const priceFilter = {};
      if (priceMin !== undefined) priceFilter.$gte = priceMin;
      if (priceMax !== undefined) priceFilter.$lte = priceMax;
      if (Object.keys(priceFilter).length > 0) {
        pipeline.push({ $match: { lowestSalePrice: priceFilter } });
      }
    }

    // Sorting
    let sortCondition = {};
    switch (sort) {
      case 'priceAsc': sortCondition = { lowestPrice: 1 }; break;
      case 'priceDesc': sortCondition = { lowestPrice: -1 }; break;
      case 'nameAsc': sortCondition = { productName: 1 }; break;
      case 'nameDesc': sortCondition = { productName: -1 }; break;
      case 'newest': sortCondition = { createdAt: -1 }; break;
      default: sortCondition = { createdAt: -1 };
    }
    pipeline.push({ $sort: sortCondition });

    // Pagination
    pipeline.push({ $skip: skip });
    pipeline.push({ $limit: limit });

    // Category lookup
    pipeline.push({
      $lookup: {
        from: 'categories',
        localField: 'categoryId',
        foreignField: '_id',
        as: 'categoryInfo'
      }
    });
    pipeline.push({ $unwind: { path: '$categoryInfo', preserveNullAndEmptyArrays: true } },
      { $match: { 'categoryInfo.isListed': true } }
    );

    // Execute query
    const products = await Product.aggregate(pipeline).exec();

    // Count total products for pagination
    const countPipeline = [
      { $match: matchStage },
      {
        $lookup: {
          from: 'categories',
          localField: 'categoryId',
          foreignField: '_id',
          as: 'categoryInfo'

        }
      },
      { $unwind: { path: '$categoryInfo', preserveNullAndEmptyArrays: true } },
      { $match: { 'categoryInfo.isListed': true } },
      {
        $lookup: {
          from: 'variants',
          localField: 'variants',
          foreignField: '_id',
          as: 'variantDocs'
        }
      },
      {
        $addFields: {
          lowestPrice: { $min: '$variantDocs.regularPrice' },
          lowestSalePrice: { $min: '$variantDocs.salePrice' }
        }
      }
    ];
    if (priceMin !== undefined || priceMax !== undefined) {
      const priceFilter = {};
      if (priceMin !== undefined) priceFilter.$gte = priceMin;
      if (priceMax !== undefined) priceFilter.$lte = priceMax;
      if (Object.keys(priceFilter).length > 0) {
        countPipeline.push({ $match: { lowestSalePrice: priceFilter } });
      }
    }
    countPipeline.push({ $count: 'totalCount' });
    const countResult = await Product.aggregate(countPipeline).exec();
    const totalProducts = countResult.length > 0 ? countResult[0].totalCount : 0;
    const totalPages = Math.ceil(totalProducts / limit);

    // Get categories with product count for filter dropdown
    const categories=await Category.aggregate([
      {$match:{isListed:true}},
      {
        $lookup:{
          from:'products',
          localField:'_id',
          foreignField:'categoryId',
          as:'products'
        }
      },
      {
        $addFields:{
          productCount:{$size:'$products'}
        }
      },
      
    ]);
     
    // Build pagination URLs
    const baseUrl = req.originalUrl.split('?')[0];
    const currentQuery = { ...req.query };

    function buildPageUrl(pageNum) {
      const params = new URLSearchParams(currentQuery);
      params.set('page', pageNum);
      return `${baseUrl}?${params.toString()}`;
    }

    const prevPageUrl = page > 1 ? buildPageUrl(page - 1) : null;
    const nextPageUrl = page < totalPages ? buildPageUrl(page + 1) : null;


    // Prepare response
    const responseData = {
      products,
      categories,
      q,
      category,
      priceMin,
      priceMax,
      sort,
      currentPage: page,
      totalPages,
      totalProducts,
      prevPageUrl,
      nextPageUrl,
      // Echo back selected brands to the UI
      brands,
    };

    // Provide all distinct brands for filter UI (optional enhancement)
    const allBrands = await Product.distinct('brand', { isListed: true });

    console.log(' Found products:', products.length);
    console.log(' Categories:', categories.length);

    // Debug: Check first product structure
    if (products.length > 0) {
      console.log('First product structure:', {
        name: products[0].productName,
        hasVariantDocs: !!products[0].variantDocs,
        variantDocsLength: products[0].variantDocs ? products[0].variantDocs.length : 0,
        firstVariant: products[0].variantDocs && products[0].variantDocs[0] ? {
          color: products[0].variantDocs[0].color,
          hasImages: !!products[0].variantDocs[0].images,
          imagesLength: products[0].variantDocs[0].images ? products[0].variantDocs[0].images.length : 0,
          images: products[0].variantDocs[0].images
        } : 'No variants'
      });
    }

    // Return JSON for Axios or render EJS
    if (req.xhr || req.headers.accept?.includes('application/json')) {
      res.json({ ...responseData, allBrands });
    } else {
      res.render('user/productlist', {
        ...responseData,
        allBrands,
        totalProducts,
        user: req.session.user || null
      });
    }

  } catch (err) {
    console.error('Error fetching products:', err);
    if (req.xhr) {
      res.status(500).json({ error: 'Server error' });
    } else {
      res.status(500).render('error/500', { title: 'Server Error' });
    }
  }
};


exports.getProductDetails = async (req, res) => {
  try {
    const productId = req.params.id;

    const product = await Product.findById(productId)
      .populate({ path: 'categoryId', select: 'name isListed' })
      .populate('variants');

    console.log(product);

    if (!product || !product.categoryId || !product.isListed || !product.categoryId.isListed) {
      return res.redirect('/user/product/list');
    }

    // Get reviews with user info
    const reviews = await Review.find({ productId })
      .populate('user', 'fullName email')
      .sort({ createdAt: -1 });

    // Get related products (same category) with their variants
    const relatedProducts = await Product.find({
      categoryId: product.categoryId?._id,
      isListed: true,
      _id: { $ne: product._id }
    })
      .limit(4)
      .populate('variants');

    console.log('Related products debug:', {
      categoryId: product.categoryId?._id,
      totalRelated: relatedProducts.length,
      relatedNames: relatedProducts.map(p => p.productName)
    });

    // Ensure we have variants with images
    if (!product.variants || product.variants.length === 0) {
      return res.redirect('/user/product/list');
    }

    // Get the first variant as default
    const defaultVariant = product.variants[0];

    res.render('user/productdetail', {
      product,
      defaultVariant,
      stock: defaultVariant.stock,
      reviews,
      relatedProducts,
      user: req.session.user || null,
      categories: [product.categoryId],
      errorMessage: req.query.error || null,
    });

  } catch (error) {
    console.error('Product details error:', error);
    res.redirect('/user/product/list');
  }
};

exports.getVariantDetails = async (req, res) => {
  try {
    const variantId = req.params.variantId;
    console.log("Fetching variant details for:", variantId);

    const variant = await Variant.findById(variantId)
      .populate({
        path: 'productId',
        select: 'offer coupon categoryId',
        populate: {
          path: 'categoryId',
          select: 'offer'
        }
      })
      .lean();

    if (!variant) {
      return res.status(404).json({
        success: false,
        error: 'Variant not found'
      });
    }

    // Calculate best offer (product or category)
    const productOffer = variant.productId?.offer || 0;
    const categoryOffer = variant.productId?.categoryId?.offer || 0;
    const bestOffer = Math.max(productOffer, categoryOffer);



    res.json({
      success: true,
      price: variant.salePrice,
      regularPrice: variant.regularPrice,
      discountPercentage: bestOffer,
      stock: variant.stock,
      color: variant.color,
      coupon: variant.productId?.coupon || null,
      offerSource: bestOffer === productOffer ? 'product' : 'category'
    });

  } catch (error) {
    console.error('Error fetching variant:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
};