import Wishlist from '../../model/wishlistSchema.js';
import Variant from '../../model/variantSchema.js';
import Product from '../../model/productSchema.js';
import Category from '../../model/categorySchema.js';
import Cart from '../../model/cartSchema.js';
import User from '../../model/userSchema.js';

// Maximum quantity per product
const MAX_QUANTITY_PER_PRODUCT = 5;

// Add item to wishlist
const addToWishlist = async (req, res) => {
  try {
    const { variantId } = req.body;
    const userId = req.session.user.id;

    // Validate input
    if (!variantId) {
      return res.status(400).json({
        success: false,
        message: 'Variant ID is required'
      });
    }

    // Get variant with product and category details
    const variant = await Variant.findById(variantId)
      .populate({
        path: 'productId',
        populate: {
          path: 'categoryId'
        }
      });

    if (!variant) {
      return res.status(404).json({
        success: false,
        message: 'Product variant not found'
      });
    }

    const product = variant.productId;
    const category = product.categoryId;

    // Check if product or category is blocked/unlisted
    if (!product.isListed) {
      return res.status(400).json({
        success: false,
        message: 'This product is currently unavailable'
      });
    }

    if (!category.isListed) {
      return res.status(400).json({
        success: false,
        message: 'This product category is currently unavailable'
      });
    }

    // Find or create wishlist
    let wishlist = await Wishlist.findOne({ userId });
    if (!wishlist) {
      wishlist = new Wishlist({ userId, items: [] });
    }

    // Check if item already exists in wishlist
    const existingItemIndex = wishlist.items.findIndex(
      item => item.variantId.toString() === variantId.toString()
    );

    if (existingItemIndex > -1) {
      return res.status(400).json({
        success: false,
        message: 'Item already in wishlist'
      });
    }

    // Add item to wishlist
    wishlist.items.push({ variantId });
    await wishlist.save();

    // Get updated wishlist count
    const totalItems = wishlist.items.length;

    res.json({
      success: true,
      message: 'Item added to wishlist successfully',
      wishlistCount: totalItems
    });

  } catch (error) {
    console.error('Add to wishlist error:', error);
    
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to add item to wishlist'
      });
    }
  }
};

// Get wishlist items
const getWishlist = async (req, res) => {
  try {
    const userId = req.session.user.id;
    
    // Get full user data including avatar
    // User is now imported at the top
    const fullUser = await User.findById(userId);

    const wishlist = await Wishlist.findOne({ userId })
      .populate({
        path: 'items.variantId',
        populate: {
          path: 'productId',
          populate: {
            path: 'categoryId'
          }
        }
      });

    // Get wishlist count for header
    const wishlistCount = wishlist ? wishlist.items.length : 0;

    if (!wishlist) {
      return res.render('user/wishlist', {
        title: 'Wishlist',
        wishlist: { items: [] },
        wishlistCount: wishlistCount,
        user: fullUser
      });
    }

    // Filter out invalid items (blocked/unlisted products)
    const validItems = wishlist.items.filter(item => {
      const variant = item.variantId;
      const product = variant?.productId;
      const category = product?.categoryId;
      
      return variant && 
             product && 
             product.isListed && 
             category && 
             category.isListed;
    });

    // Update wishlist if invalid items were found
    if (validItems.length !== wishlist.items.length) {
      wishlist.items = validItems;
      await wishlist.save();
    }

    res.render('user/wishlist', {
      title: 'Wishlist',
      wishlist,
      wishlistCount: wishlistCount,
      user: fullUser
    });

  } catch (error) {
    console.error('Get wishlist error:', error);
    res.status(500).render('error/500', { title: 'Server Error' });
  }
};

// Remove item from wishlist
const removeFromWishlist = async (req, res) => {
  try {
    const { variantId } = req.body;
    const userId = req.session.user.id;

    const wishlist = await Wishlist.findOne({ userId });
    if (!wishlist) {
      return res.status(404).json({
        success: false,
        message: 'Wishlist not found'
      });
    }

    // Remove item from wishlist
    wishlist.items = wishlist.items.filter(
      item => item.variantId.toString() !== variantId
    );

    await wishlist.save();

    // Get updated wishlist count
    const totalItems = wishlist.items.length;

    res.json({
      success: true,
      message: 'Item removed from wishlist',
      wishlistCount: totalItems
    });

  } catch (error) {
    console.error('Remove from wishlist error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to remove item from wishlist'
    });
  }
};

// Move item from wishlist to cart
const moveToCart = async (req, res) => {
  try {
    const { variantId, quantity = 1 } = req.body;
    const userId = req.session.user.id;

    // Get variant with product and category details
    const variant = await Variant.findById(variantId)
      .populate({
        path: 'productId',
        populate: {
          path: 'categoryId'
        }
      });

    if (!variant) {
      return res.status(404).json({
        success: false,
        message: 'Product variant not found'
      });
    }

    const product = variant.productId;
    const category = product.categoryId;

    // Check if product or category is blocked/unlisted
    if (!product.isListed) {
      return res.status(400).json({
        success: false,
        message: 'This product is currently unavailable'
      });
    }

    if (!category.isListed) {
      return res.status(400).json({
        success: false,
        message: 'This product category is currently unavailable'
      });
    }

    // Check stock availability
    if (variant.stock < quantity) {
      return res.status(400).json({
        success: false,
        message: `Only ${variant.stock} items available in stock`
      });
    }

    // Add to cart
    let cart = await Cart.findOne({ userId });
    if (!cart) {
      cart = new Cart({ userId, items: [] });
    }

    const existingCartItemIndex = cart.items.findIndex(
      item => item.variantId.toString() === variantId.toString()
    );

    if (existingCartItemIndex > -1) {
      const newQuantity = cart.items[existingCartItemIndex].quantity + parseInt(quantity);
      if (newQuantity > MAX_QUANTITY_PER_PRODUCT) {
        cart.items[existingCartItemIndex].quantity = MAX_QUANTITY_PER_PRODUCT;
      } else {
        cart.items[existingCartItemIndex].quantity = newQuantity;
      }
    } else {
      cart.items.push({ variantId, quantity: parseInt(quantity) });
    }

    await cart.save();

    // Remove from wishlist
    const wishlist = await Wishlist.findOne({ userId });
    if (wishlist) {
      wishlist.items = wishlist.items.filter(
        item => item.variantId.toString() !== variantId
      );
      await wishlist.save();
    }

    // Get updated counts
    const cartCount = cart.getTotalItems();
    const wishlistCount = wishlist ? wishlist.items.length : 0;

    res.json({
      success: true,
      message: 'Item moved to cart successfully',
      cartCount: cartCount,
      wishlistCount: wishlistCount
    });

  } catch (error) {
    console.error('Move to cart error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to move item to cart'
    });
  }
};

// Get wishlist count (for header display)
const getWishlistCount = async (req, res) => {
  try {
    const userId = req.session.user.id;

    const wishlist = await Wishlist.findOne({ userId });
    const count = wishlist ? wishlist.items.length : 0;

    res.json({
      success: true,
      count
    });

  } catch (error) {
    console.error('Get wishlist count error:', error);
    res.json({
      success: false,
      count: 0
    });
  }
};

export { addToWishlist, getWishlist, removeFromWishlist, moveToCart, getWishlistCount };

// Default export for compatibility
export default {
  addToWishlist,
  getWishlist,
  removeFromWishlist,
  moveToCart,
  getWishlistCount
};