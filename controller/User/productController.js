import Product from '../../model/productSchema.js';
import Category from '../../model/categorySchema.js';
import Review from '../../model/reviewSchema.js';
import Variant from '../../model/variantSchema.js';
import mongoose from 'mongoose';
import productSchema from '../../model/productSchema.js';
import User from '../../model/userSchema.js';
import Cart from '../../model/cartSchema.js';
import Wishlist from '../../model/wishlistSchema.js';





export const getShop = async (req, res) => {
  try {


    let user = null;
    if (req.session && req.session.user && req.session.user.id) {
      const userId = req.session.user.id;
      user = await User.findById(userId);
    }
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
          as: 'variantDocs',
          pipeline: [
            { $sort: { salePrice: 1 } } // Sort variants by price ascending
          ]
        }
      },

      {
        $addFields: {
          // Get the best offer (product or category) - Force maximum calculation
          bestOffer: {
            $cond: {
              if: { $gte: [{ $ifNull: ["$categoryInfo.offer", 0] }, { $ifNull: ["$offer", 0] }] },
              then: { $ifNull: ["$categoryInfo.offer", 0] },
              else: { $ifNull: ["$offer", 0] }
            }
          },
          productOffer: { $ifNull: ["$offer", 0] },
          categoryOffer: { $ifNull: ["$categoryInfo.offer", 0] },
          lowestPrice: { $min: "$variantDocs.regularPrice" },
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
          as: 'variantDocs',
          pipeline: [
            { $sort: { salePrice: 1 } } // Sort variants by price ascending
          ]
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

   //product count with category

    const allCategories=await Category.find({isListed:true}).lean();
    const allProducts=await Product.find({isListed:true}).lean();

    const categories=allCategories.map(category=>{
      const productCount=allProducts.filter(product=>
        product.categoryId.toString()===category._id.toString()
      ).length;
    
      return {
        ...category,
        productCount
      };
    })

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

    // Get cart count for header (if user is logged in)
    let cartCount = 0;
    let wishlistCount = 0;
    let userWishlistItems = [];
    if (user) {
      // Cart is now imported at the top
      const cart = await Cart.findOne({ userId: user._id });
      cartCount = cart ? cart.getTotalItems() : 0;
      
      // Get user's wishlist items
      // Wishlist is now imported at the top
      const wishlist = await Wishlist.findOne({ userId: user._id });
      if (wishlist) {
        wishlistCount = wishlist.items.length;
        userWishlistItems = wishlist.items.map(item => item.variantId.toString());
      }
    }

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
        user,
        cartCount,
        wishlistCount,
        userWishlistItems
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


export const getProductDetails = async (req, res) => {
  try {
    const productId = req.params.id;
    const selectedVariantId = req.query.variant; // Get selected variant from URL
    let user = null;
    if (req.session && req.session.user && req.session.user.id) {
      const userId = req.session.user.id;
      user = await User.findById(userId);
    }
    
    // Check if productId is a valid MongoDB ObjectId
    if (!mongoose.Types.ObjectId.isValid(productId)) {
      console.log("Invalid product ID format:", productId);
      return res.status(404).render('error/404', { title: '404 Not Found' });
    }

    const product = await Product.findById(productId)
      .populate({ path: 'categoryId', select: 'name isListed offer' })
      .populate({
        path: 'variants',
        options: { sort: { salePrice: 1 } } // Sort by price ascending - same as home page
      });

    console.log(product);

    if (!product || !product.categoryId || !product.isListed || !product.categoryId.isListed) {
      console.log("Product not found or not available:", productId);
      return res.status(404).render('error/404', { title: '404 Not Found' });
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
      .populate({
        path: 'variants',
        options: { sort: { salePrice: 1 } } // Sort by price ascending - consistent sorting
      });

    console.log('Related products debug:', {
      categoryId: product.categoryId?._id,
      totalRelated: relatedProducts.length,
      relatedNames: relatedProducts.map(p => p.productName)
    });

    // Ensure we have variants with images
    if (!product.variants || product.variants.length === 0) {
      console.log("Product has no variants:", productId);
      return res.status(404).render('error/404', { title: '404 Not Found' });
    }

    // Get the selected variant or first variant as default
    let defaultVariant = product.variants[0];
    if (selectedVariantId) {
      const foundVariant = product.variants.find(v => v._id.toString() === selectedVariantId);
      if (foundVariant) {
        defaultVariant = foundVariant;
      }
    }

    // Calculate best offer (product or category)
    const productOffer = product.offer || 0;
    const categoryOffer = product.categoryId?.offer || 0;
    const bestOffer = Math.max(productOffer, categoryOffer);
    const offerSource = bestOffer === productOffer ? 'product' : 'category';



    // Check if default variant is in user's wishlist and get counts
    let isInWishlist = false;
    let cartCount = 0;
    let wishlistCount = 0;
    if (user && defaultVariant) {
      // Get cart count
      const cart = await Cart.findOne({ userId: user._id });
      cartCount = cart ? cart.getTotalItems() : 0;
      
      // Get wishlist info
      const wishlist = await Wishlist.findOne({ userId: user._id });
      if (wishlist) {
        wishlistCount = wishlist.items.length;
        isInWishlist = wishlist.items.some(item => item.variantId.toString() === defaultVariant._id.toString());
      }
    }

    res.render('user/productdetail', {
      product,
      defaultVariant,
      activeVariant: defaultVariant, // Pass the selected variant as activeVariant
      stock: defaultVariant.stock,
      reviews,
      relatedProducts,
      categories: [product.categoryId],
      errorMessage: req.query.error || null,
      user,
      cartCount,
      wishlistCount,
      isInWishlist,
      // Offer information
      productOffer,
      categoryOffer,
      bestOffer,
      offerSource
    });

  } catch (error) {
    console.error('Product details error:', error);
    res.status(500).render('error/500', { title: 'Server Error' });
  }
};

export const getVariantDetails = async (req, res) => {
  try {
    const variantId = req.params.variantId;
    console.log("Fetching variant details for:", variantId);

    // Check if variantId is a valid MongoDB ObjectId
    if (!mongoose.Types.ObjectId.isValid(variantId)) {
      console.log("Invalid variant ID format:", variantId);
      return res.status(404).json({
        success: false,
        error: 'Variant not found'
      });
    }

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
      console.log("Variant not found:", variantId);
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
    });

  } catch (error) {
    console.error('Error fetching variant:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error'
    });
  }
};

// API endpoint to get variant data
export const getVariantAPI = async (req, res) => {
  try {
    const { variantId } = req.params;
    const Variant = (await import('../../model/variantSchema.js')).default;
    
    const variant = await Variant.findById(variantId);
    
    if (!variant) {
      return res.status(404).json({
        success: false,
        message: 'Variant not found'
      });
    }

    res.json({
      success: true,
      variant: {
        _id: variant._id,
        color: variant.color,
        salePrice: variant.salePrice,
        regularPrice: variant.regularPrice,
        stock: variant.stock,
        images: variant.images
      }
    });

  } catch (error) {
    console.error('Error fetching variant:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch variant data'
    });
  }
};

// Default export for compatibility
export default {
  getShop,
  getProductDetails,
  getVariantDetails,
  getVariantAPI
};