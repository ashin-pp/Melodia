const Cart = require('../../model/cartSchema');
const Variant = require('../../model/variantSchema');
const Product = require('../../model/productSchema');
const Category = require('../../model/categorySchema');
const mongoose = require('mongoose');

// Maximum quantity per product
const MAX_QUANTITY_PER_PRODUCT = 5;

// Add item to cart
const addToCart = async (req, res) => {
  try {
    const { variantId, quantity = 1 } = req.body;
    const userId = req.session.user.id;

    // Validate input
    if (!variantId) {
      return res.status(400).json({
        success: false,
        message: 'Variant ID is required'
      });
    }

    // Validate quantity
    const qty = parseInt(quantity);
    if (isNaN(qty) || qty < 1) {
      return res.status(400).json({
        success: false,
        message: 'Invalid quantity'
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

    // Check stock availability
    if (variant.stock < qty) {
      return res.status(400).json({
        success: false,
        message: `Only ${variant.stock} items available in stock`
      });
    }

    // Check if variant is out of stock
    if (variant.stock === 0) {
      return res.status(400).json({
        success: false,
        message: 'This product is currently out of stock'
      });
    }

    // Find or create cart
    let cart = await Cart.findOne({ userId });
    if (!cart) {
      cart = new Cart({ userId, items: [] });
    }

    // Check if item already exists in cart (by variantId, not productId)
    const existingItemIndex = cart.items.findIndex(
      item => item.variantId.toString() === variantId.toString()
    );

    if (existingItemIndex > -1) {
      // Item exists, update quantity
      const currentQuantity = cart.items[existingItemIndex].quantity;
      const newQuantity = currentQuantity + qty;

      // Check maximum quantity limit
      if (newQuantity > MAX_QUANTITY_PER_PRODUCT) {
        return res.status(400).json({
          success: false,
          message: `Maximum ${MAX_QUANTITY_PER_PRODUCT} items allowed per product`
        });
      }

      // Check stock for new quantity
      if (newQuantity > variant.stock) {
        return res.status(400).json({
          success: false,
          message: `Only ${variant.stock} items available in stock`
        });
      }

      cart.items[existingItemIndex].quantity = newQuantity;
    } else {
      // New item, add to cart
      if (qty > MAX_QUANTITY_PER_PRODUCT) {
        return res.status(400).json({
          success: false,
          message: `Maximum ${MAX_QUANTITY_PER_PRODUCT} items allowed per product`
        });
      }

      cart.items.push({
        variantId,
        quantity: qty
      });
    }

    await cart.save();

    // Remove from wishlist if exists (optional, skip if causing issues)
    try {
      const wishlist = await Wishlist.findOne({ userId });
      if (wishlist && wishlist.hasItem && typeof wishlist.hasItem === 'function') {
        if (wishlist.hasItem(variantId)) {
          await wishlist.removeItem(variantId);
        }
      }
    } catch (wishlistError) {
      console.log('Wishlist operation failed, continuing with cart add:', wishlistError.message);
    }

    // Get updated cart count
    const totalItems = cart.getTotalItems();

    res.json({
      success: true,
      message: 'Item added to cart successfully',
      cartCount: totalItems
    });

  } catch (error) {
    console.error('Add to cart error:', error);

    // Send proper error response
    if (!res.headersSent) {
      res.status(500).json({
        success: false,
        message: error.message || 'Failed to add item to cart'
      });
    }
  }
};

// Get cart items
const getCart = async (req, res) => {
  try {
    const userId = req.session.user.id;

    // Get full user data including avatar
    const User = require('../../model/userSchema');
    const fullUser = await User.findById(userId);

    const cart = await Cart.findOne({ userId })
      .populate({
        path: 'items.variantId',
        populate: {
          path: 'productId',
          populate: {
            path: 'categoryId'
          }
        }
      });

    // Get cart count for header
    const cartCount = cart ? cart.getTotalItems() : 0;

    if (!cart) {
      return res.render('user/cart', {
        title: 'Shopping Cart',
        cart: { items: [] },
        totalPrice: 0,
        cartCount: cartCount,
        user: fullUser
      });
    }

    // Filter out invalid items (blocked/unlisted products)
    const validItems = cart.items.filter(item => {
      const variant = item.variantId;
      const product = variant?.productId;
      const category = product?.categoryId;

      return variant &&
        product &&
        product.isListed &&
        category &&
        category.isListed;
    });

    // Update cart if invalid items were found
    if (validItems.length !== cart.items.length) {
      cart.items = validItems;
      await cart.save();
    }

    const totalPrice = await cart.getTotalPrice();

    res.render('user/cart', {
      title: 'Shopping Cart',
      cart,
      totalPrice,
      cartCount: cartCount,
      user: fullUser
    });

  } catch (error) {
    console.error('Get cart error:', error);
    res.status(500).render('error/500', { title: 'Server Error' });
  }
};

// Update cart item quantity
const updateCartQuantity = async (req, res) => {
  try {
    const { variantId, quantity } = req.body;
    const userId = req.session.user.id;

    // Validate input
    const qty = parseInt(quantity);
    if (isNaN(qty) || qty < 1) {
      return res.status(400).json({
        success: false,
        message: 'Invalid quantity'
      });
    }

    if (qty > MAX_QUANTITY_PER_PRODUCT) {
      return res.status(400).json({
        success: false,
        message: `Maximum ${MAX_QUANTITY_PER_PRODUCT} items allowed per product`
      });
    }

    // Get variant to check stock
    const variant = await Variant.findById(variantId);
    if (!variant) {
      return res.status(404).json({
        success: false,
        message: 'Product variant not found'
      });
    }

    // Check stock availability
    if (qty > variant.stock) {
      return res.status(400).json({
        success: false,
        message: `Only ${variant.stock} items available in stock`
      });
    }

    // Update cart
    const cart = await Cart.findOne({ userId });
    if (!cart) {
      return res.status(404).json({
        success: false,
        message: 'Cart not found'
      });
    }

    const itemIndex = cart.items.findIndex(
      item => item.variantId.toString() === variantId
    );

    if (itemIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Item not found in cart'
      });
    }

    cart.items[itemIndex].quantity = qty;
    await cart.save();

    // Calculate new totals
    await cart.populate({
      path: 'items.variantId',
      populate: {
        path: 'productId',
        populate: {
          path: 'categoryId'
        }
      }
    });

    const itemTotal = variant.salePrice * qty;
    const cartTotal = await cart.getTotalPrice();
    const totalItems = cart.getTotalItems();

    res.json({
      success: true,
      message: 'Cart updated successfully',
      itemTotal: itemTotal.toFixed(2),
      cartTotal: cartTotal.toFixed(2),
      cartCount: totalItems
    });

  } catch (error) {
    console.error('Update cart quantity error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update cart'
    });
  }
};

// Remove item from cart
const removeFromCart = async (req, res) => {
  try {
    const { variantId } = req.body;
    const userId = req.session.user.id;

    const cart = await Cart.findOne({ userId });
    if (!cart) {
      return res.status(404).json({
        success: false,
        message: 'Cart not found'
      });
    }

    // Remove item from cart
    cart.items = cart.items.filter(
      item => item.variantId.toString() !== variantId
    );

    await cart.save();

    // Calculate new totals
    await cart.populate({
      path: 'items.variantId',
      populate: {
        path: 'productId',
        populate: {
          path: 'categoryId'
        }
      }
    });

    const cartTotal = await cart.getTotalPrice();
    const totalItems = cart.getTotalItems();

    res.json({
      success: true,
      message: 'Item removed from cart',
      cartTotal: cartTotal.toFixed(2),
      cartCount: totalItems
    });

  } catch (error) {
    console.error('Remove from cart error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to remove item from cart'
    });
  }
};

// Clear entire cart
const clearCart = async (req, res) => {
  try {
    const userId = req.session.user.id;

    await Cart.findOneAndUpdate(
      { userId },
      { items: [] },
      { upsert: true }
    );

    res.json({
      success: true,
      message: 'Cart cleared successfully',
      cartTotal: '0.00',
      cartCount: 0
    });

  } catch (error) {
    console.error('Clear cart error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to clear cart'
    });
  }
};

// Get cart count (for header display)
const getCartCount = async (req, res) => {
  try {
    const userId = req.session.user.id;

    const cart = await Cart.findOne({ userId });
    const count = cart ? cart.getTotalItems() : 0;

    res.json({
      success: true,
      count
    });

  } catch (error) {
    console.error('Get cart count error:', error);
    res.json({
      success: false,
      count: 0
    });
  }
};

module.exports = {
  addToCart,
  getCart,
  updateCartQuantity,
  removeFromCart,
  clearCart,
  getCartCount
};