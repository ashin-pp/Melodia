import Cart from '../../model/cartSchema.js';
import Address from '../../model/addressSchema.js';
import Order from '../../model/orderSchema.js';
import Variant from '../../model/variantSchema.js';
import User from '../../model/userSchema.js';

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

    // Calculate totals
    const subtotal = validItems.reduce((sum, item) => {
      return sum + (item.variantId.salePrice * item.quantity);
    }, 0);

    const shippingCost = subtotal > 500 ? 0 : 50; // Free shipping above ₹500
    const taxRate = 0.18; // 18% GST
    const taxAmount = Math.round(subtotal * taxRate);
    const discountAmount = 0; // Can be implemented later
    const totalAmount = subtotal + shippingCost + taxAmount - discountAmount;

    // Get cart count for header
    const cartCount = cart.getTotalItems();

    res.render('user/checkout', {
      title: 'Checkout - Melodia',
      user: fullUser,
      cartCount,
      cart: { items: validItems },
      addresses,
      pricing: {
        subtotal,
        shippingCost,
        taxAmount,
        discountAmount,
        totalAmount
      }
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
    const { addressId, paymentMethod = 'COD' } = req.body;

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

    // Calculate totals
    const subtotal = validItems.reduce((sum, item) => {
      return sum + (item.variantId.salePrice * item.quantity);
    }, 0);

    const shippingCost = subtotal > 500 ? 0 : 50;
    const taxAmount = Math.round(subtotal * 0.18);
    const discountAmount = 0;
    const totalAmount = subtotal + shippingCost + taxAmount - discountAmount;

    // Create order items
    const orderItems = validItems.map(item => ({
      variantId: item.variantId._id,
      quantity: item.quantity,
      price: item.variantId.salePrice,
      totalPrice: item.variantId.salePrice * item.quantity
    }));

    // Generate unique order ID
    const timestamp = Date.now().toString();
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    const generatedOrderId = `ORD${timestamp}${random}`;

    // Create order
    console.log('Creating order with data:', {
      orderId: generatedOrderId,
      userId,
      itemsCount: orderItems.length,
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
      items: orderItems,
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
      paymentMethod,
      subtotal,
      shippingCost,
      taxAmount,
      discountAmount,
      totalAmount,
      expectedDeliveryDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days from now
    });

    console.log('Saving order...');
    await order.save();
    console.log('Order saved successfully with ID:', order.orderId);

    // Update stock for each variant
    console.log('Updating stock for', validItems.length, 'items');
    for (const item of validItems) {
      console.log(`Updating stock for variant ${item.variantId._id}: -${item.quantity}`);
      await Variant.findByIdAndUpdate(
        item.variantId._id,
        { $inc: { stock: -item.quantity } }
      );
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

export { getCheckout, placeOrder, orderSuccess };

// Default export for compatibility
export default {
  getCheckout,
  placeOrder,
  orderSuccess
};