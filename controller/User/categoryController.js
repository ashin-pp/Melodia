const Category = require('../../model/categorySchema');
const Product = require('../../model/productSchema');
const mongoose = require('mongoose');


exports.getCategoryPage = async (req, res) => {
  try {
    const { id } = req.params;
    const page = parseInt(req.params.page) || 1;
    const limit = 12;
    const skip = (page - 1) * limit;

    const {
      q = '',
      priceMin = '',
      priceMax = '',
      sort = '',
      brand = '',
    } = req.query;

    // Check if category ID is a valid MongoDB ObjectId
    if (!mongoose.Types.ObjectId.isValid(id)) {
      console.log("Invalid category ID format:", id);
      return res.status(404).render('error/404', { title: '404 Not Found' });
    }

    const category = await Category.findById(id).lean();
    if (!category) {
      console.log("category not found:", id);
      return res.status(404).render('error/404', { title: '404 Not Found' });
    }
    if (!category.isListed) {
      console.log("category is unlisted:", id);
      return res.status(404).render('error/404', { title: '404 Not Found' });
    }



    const matchStage = {
      categoryId: category._id,
      isListed: true
    };

    if (q.trim()) {
      matchStage.$or = [
        { productName: { $regex: q, $options: 'i' } },
        { brand: { $regex: q, $options: 'i' } }
      ]
    }

    if (brand.trim()) {
      matchStage.brand = { $regex: brand, $options: 'i' }
    }


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
      { $unwind: { path: '$categoryInfo', preserveNullAndEmptyArrays: false } },
      { $match: { 'categoryInfo.isListed': true } },


      {
        $lookup: {
          from: 'variants',
          localField: 'variants',
          foreignField: '_id',
          as: 'variants'

        }
      },
      {
        $addFields: {
          bestOffer: {
            $max: [
              { $ifNull: ['$offer', 0] },
              { $ifNull: ['$categoryInfo.offer', 0] }
            ]
          },
          lowestPrice: {
            $ifNull: [{ $min: '$variants.regularPrice' }, 0]
          },
          lowestSalePrice: {
            $ifNull: [{ $min: '$variants.salePrice' }, 0]
          }
        }
      }

    ]




    if (priceMin || priceMax) {
      const pricefilter = {};
      if (priceMin) pricefilter.$gte = parseFloat(priceMin);
      if (priceMax) pricefilter.$lte = parseFloat(priceMax);


      pipeline.push({ $match: { lowestSalePrice: pricefilter } });

    }


    let sortStage = { createdAt: -1 };
    switch (sort) {
      case 'priceAsc':
        sortStage = { lowestSalePrice: 1 };
        break;
      case 'priceDesc':
        sortStage = { lowestSalePrice: -1 };
        break;
      case 'nameAsc':
        sortStage = { productName: 1 };
        break;
      case 'nameDesc':
        sortStage = { productName: -1 };
        break;
      case 'newest':
        sortStage = { createdAt: -1 };
        break;
    }
    pipeline.push({ $sort: sortStage });

    const countPipeline = [...pipeline, { $count: 'total' }]
    const countResult = await Product.aggregate(countPipeline);
    const totalProducts = countResult[0]?.total || 0;


    pipeline.push({ $skip: skip }, { $limit: limit });
    const products = await Product.aggregate(pipeline);
    const totalPages = Math.ceil(totalProducts / limit);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    // Prepare user data
    const user = req.session?.user || null;
    const isLoggedIn = !!user;

    // Handle AJAX requests (for filtering)
    if (req.headers.accept?.includes('application/json')) {
      return res.json({
        success: true,
        products,
        currentPage: page,
        totalPages,
        totalProducts,
        hasNextPage,
        hasPrevPage
      });
    }

    res.render('user/category', {
      category,
      products,
      currentPage: page,
      totalPages,
      totalProducts,
      hasNextPage,
      hasPrevPage,
      nextPageUrl: hasNextPage ? `${req.path}?${new URLSearchParams({ ...req.query, page: page + 1 })}` : null,
      prevPageUrl: hasPrevPage ? `${req.path}?${new URLSearchParams({ ...req.query, page: page - 1 })}` : null,
      user,
      isLoggedIn,
      q,
      priceMin,
      priceMax,
      sort,
      brand
    });

  } catch (error) {
    console.error('Error in getCategoryPage:', error);
    res.status(500).render('error/500', {
      title: 'Server Error',
      message: 'An error occurred while loading the category page.'
    });
  }
};

exports.getCategoriesPage = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 8; // Show 8 categories per page
    const skip = (page - 1) * limit;

    // Get search parameter
    const { q = '' } = req.query;

    // Build match stage
    const matchStage = {
      isListed: true
    };

    // Add search filter if provided
    if (q.trim()) {
      matchStage.$or = [
        { name: { $regex: q, $options: 'i' } },
        { description: { $regex: q, $options: 'i' } }
      ];
    }

    // Get categories with product count - SIMPLIFIED
    const pipeline = [
      { $match: matchStage },
      {
        $lookup: {
          from: 'products',
          localField: '_id',
          foreignField: 'categoryId',
          as: 'products'
        }
      },
      {
        $addFields: {
          productCount: { $size: '$products' }
        }
      },
      { $sort: { name: 1 } }
    ];

    // Get total count for pagination
    const totalCategories = await Category.countDocuments(matchStage);

    // Add pagination
    const categoriesWithCount = await Category.aggregate([
      ...pipeline,
      { $skip: skip },
      { $limit: limit }
    ]);

    // Get featured categories (top 4 with most products) - SIMPLIFIED
    const featuredCategories = await Category.aggregate([
      { $match: { isListed: true } },
      {
        $lookup: {
          from: 'products',
          localField: '_id',
          foreignField: 'categoryId',
          as: 'products'
        }
      },
      {
        $addFields: {
          productCount: { $size: '$products' }
        }
      },
      { $match: { productCount: { $gt: 0 } } }, // Only categories with products
      { $sort: { productCount: -1 } },
      { $limit: 4 }
    ]);

    // Pagination info
    const totalPages = Math.ceil(totalCategories / limit);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    // Prepare user data
    const user = req.session?.user || null;
    const isLoggedIn = !!user;

    // Handle AJAX requests
    if (req.headers.accept?.includes('application/json')) {
      return res.json({
        success: true,
        categories: categoriesWithCount,
        currentPage: page,
        totalPages,
        totalCategories,
        hasNextPage,
        hasPrevPage
      });
    }

    // Render page
    res.render('user/categories', {
      categories: categoriesWithCount,
      featuredCategories,
      currentPage: page,
      totalPages,
      totalCategories,
      hasNextPage,
      hasPrevPage,
      nextPageUrl: hasNextPage ? `${req.path}?${new URLSearchParams({ ...req.query, page: page + 1 })}` : null,
      prevPageUrl: hasPrevPage ? `${req.path}?${new URLSearchParams({ ...req.query, page: page - 1 })}` : null,
      user,
      isLoggedIn,
      q // Current search query
    });

  } catch (error) {
    console.error('Error in getCategoriesPage:', error);
    res.status(500).render('error/500', {
      title: 'Server Error',
      message: 'An error occurred while loading categories.'
    });
  }
};