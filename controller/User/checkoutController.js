import Cart from '../../model/cartSchema.js';
import Address from '../../model/addressSchema.js';
import Order from '../../model/orderSchema.js';
import Variant from '../../model/variantSchema.js';
import User from '../../model/userSchema.js';
import Coupon from '../../model/couponSchema.js';
// Offer helper removed - using existing offer system
import razorpay from '../../config/razorpay.js';
import walletService from '../../services/walletService.js';
import crypto from 'crypto';

// Get checkout page
const getCheckout = async (req, res) => {
  try {
    const userId = req.session.user.id;
    
    // Get full user data
   
    const fullUser = await User.findById(userId);

    // Get user's cart
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

    if (!cart || cart.items.length === 0) {
      return res.redirect('/cart');
    }

    // Filter valid items (in stock, listed products)
    const validItems = cart.items.filter(item => {
      const variant = item.variantId;
      const product = variant?.productId;
      const category = product?.categoryId;
      
      return variant && 
             variant.stock > 0 && 
             product && 
             product.isListed && 
             category && 
             category.isListed;
    });

    if (validItems.length === 0) {
      return res.redirect('/cart');
    }

    // Get user addresses
    const addresses = await Address.find({ 
      userId, 
      isActive: true 
    }).sort({ isDefault: -1, createdAt: -1 });

    // Calculate totals (offer calculation removed)
    let subtotal = 0;
    
    const itemsWithOffers = validItems.map((item) => {
      const variant = item.variantId;
      const itemTotal = variant.salePrice * item.quantity;
      
      subtotal += itemTotal;
      
      return {
        ...item.toObject(),
        itemTotal
      };
    });

    const shippingCost = subtotal > 500 ? 0 : 50; // Free shipping above ₹500
    const taxRate = 0.18; // 18% GST
    const taxAmount = Math.round(subtotal * taxRate);
    
    // Get available coupons for user
    const availableCoupons = await Coupon.find({
      isActive: true,
      startDate: { $lte: new Date() },
      endDate: { $gte: new Date() },
      minimumOrderAmount: { $lte: subtotal },
      $or: [
        { usageLimit: null },
        { $expr: { $lt: ['$usedCount', '$usageLimit'] } }
      ]
    }).select('code name discountType discountValue maxDiscountAmount minimumOrderAmount description');
    
    const totalAmount = subtotal + shippingCost + taxAmount;

    // Get cart count for header
    const cartCount = cart.getTotalItems();

    // Get wallet balance
    const walletBalance = await walletService.getBalance(userId);

    res.render('user/checkout', {
      title: 'Checkout - Melodia',
      user: fullUser,
      cartCount,
      cart: { items: itemsWithOffers },
      addresses,
      availableCoupons,
      walletBalance,
      pricing: {
        subtotal,
        shippingCost,
        taxAmount,
        offerDiscount: 0, // Offer discount removed - using existing offer system
        couponDiscount: 0,
        totalAmount
      },
      razorpayKeyId: process.env.RAZORPAY_KEY_ID
    });

  } catch (error) {
    console.error('Get checkout error:', error);
    res.status(500).render('error/500', { title: 'Server Error' });
  }
};

// Place order
const placeOrder = async (req, res) => {
  try {
    console.log('=== PLACE ORDER DEBUG START ===');
    console.log('Request body:', req.body);
    console.log('User ID:', req.session.user?.id);
    
    const userId = req.session.user.id;
    const { addressId, paymentMethod = 'COD', couponCode, useWallet = false } = req.body;

    // Validate address
    if (!addressId) {
      return res.status(400).json({
        success: false,
        message: 'Please select a delivery address'
      });
    }

    console.log('Looking for address:', addressId, 'for user:', userId);
    
    const address = await Address.findOne({ 
      _id: addressId, 
      userId, 
      isActive: true 
    });

    console.log('Address found:', address ? 'Yes' : 'No');
    if (address) {
      console.log('Address details:', {
        fullName: address.fullName,
        city: address.city,
        country: address.country
      });
    }

    if (!address) {
      return res.status(400).json({
        success: false,
        message: 'Invalid delivery address'
      });
    }

    // Get user's cart
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

    if (!cart || cart.items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Your cart is empty'
      });
    }

    // Validate all items are available
    const validItems = [];
    for (const item of cart.items) {
      const variant = item.variantId;
      const product = variant?.productId;
      const category = product?.categoryId;

      if (!variant || !product || !category) {
        continue;
      }

      if (!product.isListed || !category.isListed) {
        return res.status(400).json({
          success: false,
          message: `${product.productName} is no longer available`
        });
      }

      if (variant.stock < item.quantity) {
        return res.status(400).json({
          success: false,
          message: `Only ${variant.stock} units of ${product.productName} are available`
        });
      }

      validItems.push(item);
    }

    if (validItems.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No valid items in cart'
      });
    }

    // Apply offers and calculate totals
    let subtotal = 0;
    // Offer discount calculation removed
    
    const itemsWithOffers = validItems.map((item) => {
      const variant = item.variantId;
      const itemTotal = variant.salePrice * item.quantity;
      
      subtotal += itemTotal;
      
      return {
        variantId: variant._id,
        quantity: item.quantity,
        price: variant.salePrice,
        totalPrice: itemTotal
      };
    });

    const shippingCost = subtotal > 500 ? 0 : 50;
    const taxAmount = Math.round(subtotal * 0.18);
    
    // Apply coupon if provided
    let couponDiscount = 0;
    let appliedCoupon = null;
    
    if (couponCode) {
      const coupon = await Coupon.findOne({
        code: couponCode.toUpperCase(),
        isActive: true,
        startDate: { $lte: new Date() },
        endDate: { $gte: new Date() },
        minimumOrderAmount: { $lte: subtotal }
      });
      
      if (coupon) {
        if (coupon.discountType === 'percentage') {
          couponDiscount = Math.round((subtotal * coupon.discountValue) / 100);
          if (coupon.maxDiscountAmount && couponDiscount > coupon.maxDiscountAmount) {
            couponDiscount = coupon.maxDiscountAmount;
          }
        } else {
          couponDiscount = Math.min(coupon.discountValue, subtotal);
        }
        appliedCoupon = coupon;
      }
    }
    
    // Get user for wallet balance
    const user = await User.findById(userId);
    let walletUsed = 0;
    
    let totalAmount = subtotal + shippingCost + taxAmount - couponDiscount;
    const originalTotalAmount = totalAmount; // Store original total for admin display
    
    // Apply wallet if requested
    if (useWallet) {
      const walletBalance = await walletService.getBalance(userId);
      if (walletBalance > 0) {
        walletUsed = Math.min(walletBalance, totalAmount);
        totalAmount -= walletUsed;
      }
    }

    // Handle different payment methods
    if (paymentMethod === 'razorpay' && totalAmount > 0) {
      if (!razorpay) {
        return res.status(500).json({
          success: false,
          message: 'Payment gateway not available'
        });
      }
      
      // Generate unique order ID for Razorpay
      const timestamp = Date.now().toString();
      const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
      const razorpayOrderId = `ORD${timestamp}${random}`;
      
      const razorpayOrder = await razorpay.orders.create({
        amount: Math.round(totalAmount * 100), // Convert to paise
        currency: 'INR',
        receipt: razorpayOrderId,
        payment_capture: 1
      });
      
      return res.json({
        success: true,
        requiresPayment: true,
        razorpayOrder: {
          id: razorpayOrder.id,
          amount: razorpayOrder.amount,
          currency: razorpayOrder.currency,
          key: process.env.RAZORPAY_KEY_ID
        },
        orderData: {
          addressId,
          couponCode,
          useWallet,
          subtotal,
          shippingCost,
          taxAmount,
          couponDiscount,
          walletUsed,
          totalAmount,
          items: itemsWithOffers
        }
      });
    }
    
    // Handle wallet payment
    if (paymentMethod === 'wallet') {
      const validation = await walletService.validateWalletPayment(userId, originalTotalAmount);
      if (!validation.valid) {
        return res.status(400).json({
          success: false,
          message: validation.message,
          currentBalance: validation.currentBalance,
          requiredAmount: originalTotalAmount
        });
      }
      // Full wallet payment - set walletUsed to original total amount
      walletUsed = originalTotalAmount;
      totalAmount = 0; // Remaining amount after wallet payment
    }

    // Generate unique order ID
    const timestamp = Date.now().toString();
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    const generatedOrderId = `ORD${timestamp}${random}`;

    // Create order
    console.log('Creating order with data:', {
      orderId: generatedOrderId,
      userId,
      itemsCount: itemsWithOffers.length,
      paymentMethod,
      totalAmount,
      addressData: {
        fullName: address.fullName,
        city: address.city,
        country: address.country
      }
    });

    const order = new Order({
      orderId: generatedOrderId,
      userId,
      items: itemsWithOffers,
      shippingAddress: {
        fullName: address.fullName,
        phoneNumber: address.phoneNumber,
        addressLine1: address.addressLine1,
        addressLine2: address.addressLine2,
        city: address.city,
        state: address.state,
        pincode: address.pincode,
        country: address.country
      },
      paymentMethod: paymentMethod === 'razorpay' ? 'RAZORPAY' : paymentMethod === 'wallet' ? 'WALLET' : 'COD',
      subtotal,
      shippingCost,
      taxAmount,
      offerDiscount: 0, // Offer discount removed - using existing offer system
      couponDiscount,
      couponCode: appliedCoupon?.code,
      walletAmountUsed: walletUsed,
      totalAmount: originalTotalAmount, // Store original total for admin display
      paymentStatus: paymentMethod === 'COD' ? 'Pending' : 'Paid',
      expectedDeliveryDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days from now
    });

    console.log('Saving order...');
    await order.save();
    console.log('Order saved successfully with ID:', order.orderId);

    // Update stock for each variant
    console.log('Updating stock for', itemsWithOffers.length, 'items');
    for (const item of itemsWithOffers) {
      console.log(`Updating stock for variant ${item.variantId}: -${item.quantity}`);
      await Variant.findByIdAndUpdate(
        item.variantId,
        { $inc: { stock: -item.quantity } }
      );
    }
    
    // Update coupon usage
    if (appliedCoupon) {
      await Coupon.findByIdAndUpdate(appliedCoupon._id, {
        $inc: { usedCount: 1 }
      });
    }
    
    // Process wallet payment
    if (walletUsed > 0) {
      try {
        await walletService.processWalletPayment(userId, walletUsed, order._id);
        console.log(`Wallet payment processed: ${walletUsed} for order ${generatedOrderId}`);
      } catch (walletError) {
        console.error('Wallet payment error:', walletError);
        // Note: Order is already created, so we log the error but don't fail the order
      }
    }

    // Clear user's cart
    console.log('Clearing cart...');
    cart.items = [];
    await cart.save();
    console.log('Cart cleared successfully');

    console.log('=== ORDER PLACED SUCCESSFULLY ===');
    console.log('Order ID:', order.orderId);
    console.log('Order Object ID:', order._id);
    
    res.json({
      success: true,
      message: 'Order placed successfully',
      orderId: order.orderId,
      orderObjectId: order._id
    });

  } catch (error) {
    console.error('=== PLACE ORDER ERROR ===');
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    console.error('=== END ERROR ===');
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to place order'
    });
  }
};

// Order success page
const orderSuccess = async (req, res) => {
  try {
    console.log('Order success page requested');
    const userId = req.session.user.id;
    const orderId = req.params.orderId;
    
    console.log('Looking for order:', orderId, 'for user:', userId);

    // Get full user data
    const fullUser = await User.findById(userId);

    // Get order details
    const order = await Order.findOne({ 
      _id: orderId, 
      userId 
    }).populate({
      path: 'items.variantId',
      populate: {
        path: 'productId'
      }
    });
    
    console.log('Order found:', order ? 'Yes' : 'No');

    if (!order) {
      return res.status(404).render('error/404', { title: 'Order Not Found' });
    }

    // Get cart count for header
    const cart = await Cart.findOne({ userId });
    const cartCount = cart ? cart.getTotalItems() : 0;

    res.render('user/order-success', {
      title: 'Order Placed Successfully - Melodia',
      user: fullUser,
      cartCount,
      order
    });

  } catch (error) {
    console.error('Order success error:', error);
    res.status(500).render('error/500', { title: 'Server Error' });
  }
};

// Complete Razorpay order after payment
const completeRazorpayOrder = async (req, res) => {
  try {
    const { razorpayPaymentId, razorpayOrderId, razorpaySignature, orderData } = req.body;
    const userId = req.session.user.id;
    
    console.log('=== RAZORPAY COMPLETION START ===');
    console.log('Payment ID:', razorpayPaymentId);
    console.log('Order ID:', razorpayOrderId);
    console.log('Signature:', razorpaySignature);
    
    // Verify payment signature
    const body = razorpayOrderId + "|" + razorpayPaymentId;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(body.toString())
      .digest('hex');
    
    const isAuthentic = expectedSignature === razorpaySignature;
    console.log('Payment verification:', isAuthentic ? 'SUCCESS' : 'FAILED');
    
    if (!isAuthentic) {
      return res.status(400).json({
        success: false,
        message: 'Payment verification failed'
      });
    }
    
    // Get address
    const address = await Address.findOne({ 
      _id: orderData.addressId, 
      userId, 
      isActive: true 
    });
    
    if (!address) {
      return res.status(400).json({
        success: false,
        message: 'Invalid delivery address'
      });
    }
    
    // Generate unique order ID
    const timestamp = Date.now().toString();
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    const generatedOrderId = `ORD${timestamp}${random}`;
    
    // Validate orderData
    console.log('=== VALIDATING ORDER DATA ===');
    console.log('Order Data Items:', JSON.stringify(orderData.items, null, 2));
    console.log('Items count:', orderData.items?.length);
    
    if (!orderData.items || orderData.items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No items found in order data'
      });
    }
    
    // Create order
    const order = new Order({
      orderId: generatedOrderId,
      userId,
      items: orderData.items,
      shippingAddress: {
        fullName: address.fullName,
        phoneNumber: address.phoneNumber,
        addressLine1: address.addressLine1,
        addressLine2: address.addressLine2,
        city: address.city,
        state: address.state,
        pincode: address.pincode,
        country: address.country
      },
      paymentMethod: 'RAZORPAY',
      razorpayOrderId: razorpayOrderId,
      razorpayPaymentId: razorpayPaymentId,
      razorpaySignature: razorpaySignature,
      subtotal: orderData.subtotal,
      shippingCost: orderData.shippingCost,
      taxAmount: orderData.taxAmount,
      // Offer discount removed
      couponDiscount: orderData.couponDiscount,
      couponCode: orderData.couponCode,
      walletAmountUsed: orderData.walletUsed,
      totalAmount: orderData.totalAmount,
      paymentStatus: 'Paid',
      expectedDeliveryDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    });
    
    try {
      await order.save();
      console.log('=== ORDER SAVED SUCCESSFULLY ===');
      console.log('Order ID:', order.orderId);
      console.log('Order Object ID:', order._id);
    } catch (saveError) {
      console.error('=== ORDER SAVE ERROR ===');
      console.error('Save Error:', saveError);
      console.error('Validation Errors:', saveError.errors);
      return res.status(400).json({
        success: false,
        message: 'Order validation failed: ' + saveError.message
      });
    }
    
    // Update stock
    try {
      console.log('=== UPDATING STOCK ===');
      for (const item of orderData.items) {
        console.log(`Updating stock for variant ${item.variantId}: -${item.quantity}`);
        await Variant.findByIdAndUpdate(
          item.variantId,
          { $inc: { stock: -item.quantity } }
        );
      }
      console.log('Stock updated successfully');
    } catch (stockError) {
      console.error('Stock update error:', stockError);
      // Don't fail the order for stock update errors
    }
    
    // Update coupon usage
    try {
      if (orderData.couponCode) {
        console.log('=== UPDATING COUPON USAGE ===');
        await Coupon.findOneAndUpdate(
          { code: orderData.couponCode.toUpperCase() },
          { $inc: { usedCount: 1 } }
        );
        console.log('Coupon usage updated');
      }
    } catch (couponError) {
      console.error('Coupon update error:', couponError);
      // Don't fail the order for coupon update errors
    }
    
    // Process wallet payment if used
    if (orderData.walletUsed > 0) {
      try {
        await walletService.processWalletPayment(userId, orderData.walletUsed, order._id);
        console.log(`Wallet payment processed: ${orderData.walletUsed} for order ${generatedOrderId}`);
      } catch (walletError) {
        console.error('Wallet payment error:', walletError);
        // Note: Order is already created, so we log the error but don't fail the order
      }
    }
    
    // Clear cart
    try {
      console.log('=== CLEARING CART ===');
      const cart = await Cart.findOne({ userId });
      if (cart) {
        cart.items = [];
        await cart.save();
        console.log('Cart cleared successfully');
      }
    } catch (cartError) {
      console.error('Cart clear error:', cartError);
      // Don't fail the order for cart clear errors
    }
    
    console.log('=== SENDING SUCCESS RESPONSE ===');
    console.log('Response data:', {
      success: true,
      message: 'Order placed successfully',
      orderId: order.orderId,
      orderObjectId: order._id
    });
    
    res.json({
      success: true,
      message: 'Order placed successfully',
      orderId: order.orderId,
      orderObjectId: order._id
    });
    
  } catch (error) {
    console.error('Complete Razorpay order error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to complete order'
    });
  }
};

export { getCheckout, placeOrder, orderSuccess, completeRazorpayOrder };

// Default export for compatibility
export default {
  getCheckout,
  placeOrder,
  orderSuccess,
  completeRazorpayOrder
};