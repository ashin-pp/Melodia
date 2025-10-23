import Order from '../../model/orderSchema.js';
import Variant from '../../model/variantSchema.js';
import User from '../../model/userSchema.js';
import Cart from '../../model/cartSchema.js';
import PDFDocument from 'pdfkit';
import mongoose from 'mongoose';

// Get all orders for user
const getOrders = async (req, res) => {
  try {
    const userId = req.session.user.id;
    const page = parseInt(req.query.page) || 1;
    const limit = 10;
    const skip = (page - 1) * limit;
    const search = req.query.search || '';

    // Get full user data
    const fullUser = await User.findById(userId);
    
    // Get cart count for header
    const cart = await Cart.findOne({ userId });
    const cartCount = cart ? cart.getTotalItems() : 0;

    // Build search query
    let searchQuery = { userId };
    if (search) {
      searchQuery.$or = [
        { orderId: { $regex: search, $options: 'i' } },
        { orderStatus: { $regex: search, $options: 'i' } }
      ];
    }

    // Get orders with pagination
    const orders = await Order.find(searchQuery)
      .populate({
        path: 'items.variantId',
        select: 'color images',
        populate: {
          path: 'productId',
          select: 'productName images brand'
        }
      })
      .sort({ orderDate: -1 })
      .skip(skip)
      .limit(limit);

    // Get total count for pagination
    const totalOrders = await Order.countDocuments(searchQuery);
    const totalPages = Math.ceil(totalOrders / limit);

    res.render('user/orders', {
      title: 'My Orders - Melodia',
      user: fullUser,
      cartCount,
      orders,
      currentPage: page,
      totalPages,
      search,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
      nextPage: page + 1,
      prevPage: page - 1
    });

  } catch (error) {
    console.error('Get orders error:', error);
    res.status(500).render('error/500', { title: 'Server Error' });
  }
};

// Get single order details
const getOrderDetails = async (req, res) => {
  try {
    console.log('Get order details called');
    console.log('Request params:', req.params);
    console.log('Request URL:', req.url);
    
    const userId = req.session.user.id;
    const orderId = req.params.orderId;
    
    console.log('Extracted orderId:', orderId, 'Type:', typeof orderId);
    
    // Validate orderId format
    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      console.log('Invalid orderId format:', orderId);
      return res.status(400).send(`
        <html>
          <head><title>Invalid Order ID</title></head>
          <body style="font-family: Arial; padding: 50px; text-align: center;">
            <h1>Invalid Order ID</h1>
            <p>The order ID format is invalid: ${orderId}</p>
            <a href="/orders">← Back to Orders</a>
          </body>
        </html>
      `);
    }

    // Get full user data
    const fullUser = await User.findById(userId);
    
    // Get cart count for header
    const cart = await Cart.findOne({ userId });
    const cartCount = cart ? cart.getTotalItems() : 0;

    // Get order details
    const order = await Order.findOne({ 
      _id: orderId, 
      userId 
    }).populate({
      path: 'items.variantId',
      select: 'color images',
      populate: {
        path: 'productId',
        select: 'productName brand images'
      }
    }).populate({
      path: 'cancelledItems.variantId',
      select: 'color images',
      populate: {
        path: 'productId',
        select: 'productName brand images'
      }
    });

    console.log('Order found:', order ? 'Yes' : 'No');
    if (order) {
      console.log('Order items count:', order.items.length);
      console.log('Cancelled items count:', order.cancelledItems ? order.cancelledItems.length : 0);
      console.log('Order structure:', {
        orderId: order.orderId,
        orderStatus: order.orderStatus,
        totalAmount: order.totalAmount,
        hasItems: order.items && order.items.length > 0,
        hasShippingAddress: !!order.shippingAddress,
        hasCancelledItems: order.cancelledItems && order.cancelledItems.length > 0
      });
      
      // Debug cancelled items
      if (order.cancelledItems && order.cancelledItems.length > 0) {
        console.log('Cancelled items details:');
        order.cancelledItems.forEach((cancelled, index) => {
          console.log(`Cancelled item ${index}:`, {
            variantId: cancelled.variantId._id,
            quantity: cancelled.quantity,
            reason: cancelled.reason,
            cancelledAt: cancelled.cancelledAt
          });
        });
      }
    }

    if (!order) {
      return res.status(404).render('error/404', { title: 'Order Not Found' });
    }

    res.render('user/order-details', {
      title: `Order ${order.orderId} - Melodia`,
      user: fullUser,
      cartCount,
      order
    });

  } catch (error) {
    console.error('Get order details error:', error);
    console.error('Error stack:', error.stack);
    
    // Send a simple error response instead of trying to render error template
    res.status(500).send(`
      <html>
        <head><title>Server Error</title></head>
        <body style="font-family: Arial; padding: 50px; text-align: center;">
          <h1>Server Error</h1>
          <p>Error: ${error.message}</p>
          <a href="/orders">← Back to Orders</a>
        </body>
      </html>
    `);
  }
};

// Cancel entire order
const cancelOrder = async (req, res) => {
  try {
    const userId = req.session.user.id;
    const orderId = req.params.orderId;
    const { reason } = req.body;

    const order = await Order.findOne({ 
      _id: orderId, 
      userId 
    }).populate('items.variantId');

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Check if order can be cancelled
    if (!['Pending', 'Confirmed', 'Processing'].includes(order.orderStatus)) {
      return res.status(400).json({
        success: false,
        message: 'Order cannot be cancelled at this stage'
      });
    }

    // Restore stock for all items
    for (const item of order.items) {
      await Variant.findByIdAndUpdate(
        item.variantId._id,
        { $inc: { stock: item.quantity } }
      );
    }

    // Cancel the order
    await order.cancelOrder(reason);

    res.json({
      success: true,
      message: 'Order cancelled successfully'
    });

  } catch (error) {
    console.error('Cancel order error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to cancel order'
    });
  }
};

// Cancel specific items
const cancelOrderItems = async (req, res) => {
  try {
    console.log('Cancel items request:', { orderId: req.params.orderId, items: req.body.items, reason: req.body.reason });
    
    const userId = req.session.user.id;
    const orderId = req.params.orderId;
    const { items, reason } = req.body;
    
    // Validate orderId format
    if (!mongoose.Types.ObjectId.isValid(orderId)) {
      console.log('Invalid orderId format in cancel items:', orderId);
      return res.status(400).json({
        success: false,
        message: 'Invalid order ID format'
      });
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No items specified for cancellation'
      });
    }

    const order = await Order.findOne({ 
      _id: orderId, 
      userId 
    }).populate('items.variantId');

    console.log('Order found:', order ? 'Yes' : 'No');

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Check if order can be cancelled
    if (!['Pending', 'Confirmed', 'Processing'].includes(order.orderStatus)) {
      return res.status(400).json({
        success: false,
        message: 'Order items cannot be cancelled at this stage'
      });
    }

    // Restore stock for cancelled items
    console.log('Restoring stock for items:', items);
    for (const item of items) {
      console.log(`Restoring stock for variant ${item.variantId}: +${item.quantity}`);
      await Variant.findByIdAndUpdate(
        item.variantId,
        { $inc: { stock: item.quantity } }
      );
    }

    // Cancel the items
    console.log('Cancelling items in order...');
    await order.cancelItems(items, reason);
    console.log('Items cancelled successfully');

    res.json({
      success: true,
      message: 'Items cancelled successfully'
    });

  } catch (error) {
    console.error('Cancel order items error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to cancel items'
    });
  }
};

// Return order
const returnOrder = async (req, res) => {
  try {
    const userId = req.session.user.id;
    const orderId = req.params.orderId;
    const { reason } = req.body;

    if (!reason || reason.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Return reason is required'
      });
    }

    const order = await Order.findOne({ 
      _id: orderId, 
      userId 
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Check if order can be returned
    if (order.orderStatus !== 'Delivered') {
      return res.status(400).json({
        success: false,
        message: 'Only delivered orders can be returned'
      });
    }

    // Check if return window is still open (e.g., 7 days)
    const returnWindow = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds
    const timeSinceDelivery = Date.now() - order.deliveredDate.getTime();
    
    if (timeSinceDelivery > returnWindow) {
      return res.status(400).json({
        success: false,
        message: 'Return window has expired'
      });
    }

    // Return the order
    await order.returnOrder(reason);

    res.json({
      success: true,
      message: 'Return request submitted successfully'
    });

  } catch (error) {
    console.error('Return order error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to submit return request'
    });
  }
};

// Download invoice
const downloadInvoice = async (req, res) => {
  try {
    const userId = req.session.user.id;
    const orderId = req.params.orderId;

    const order = await Order.findOne({ 
      _id: orderId, 
      userId 
    }).populate({
      path: 'items.variantId',
      populate: {
        path: 'productId',
        select: 'productName brand'
      }
    }).populate('userId', 'fullName email phoneNumber');

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Create PDF
    const doc = new PDFDocument({ margin: 50 });
    
    // Set response headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="invoice-${order.orderId}.pdf"`);
    
    // Pipe PDF to response
    doc.pipe(res);

    // Add content to PDF
    // Header
    doc.fontSize(20).text('MELODIA', 50, 50);
    doc.fontSize(10).text('E-commerce Store', 50, 75);
    doc.text('Email: support@melodia.com', 50, 90);
    doc.text('Phone: +91 9876543210', 50, 105);

    // Invoice title
    doc.fontSize(16).text('INVOICE', 400, 50);
    doc.fontSize(10).text(`Invoice #: ${order.orderId}`, 400, 75);
    doc.text(`Date: ${order.orderDate.toLocaleDateString()}`, 400, 90);

    // Customer details
    doc.fontSize(12).text('Bill To:', 50, 150);
    doc.fontSize(10).text(order.shippingAddress.fullName, 50, 170);
    doc.text(order.shippingAddress.addressLine1, 50, 185);
    if (order.shippingAddress.addressLine2) {
      doc.text(order.shippingAddress.addressLine2, 50, 200);
    }
    doc.text(`${order.shippingAddress.city}, ${order.shippingAddress.state}`, 50, 215);
    doc.text(`${order.shippingAddress.pincode}, ${order.shippingAddress.country}`, 50, 230);

    // Order details table
    let yPosition = 280;
    doc.fontSize(12).text('Order Details:', 50, yPosition);
    yPosition += 20;

    // Table headers
    doc.fontSize(10);
    doc.text('Item', 50, yPosition);
    doc.text('Qty', 300, yPosition);
    doc.text('Price', 350, yPosition);
    doc.text('Total', 450, yPosition);
    yPosition += 20;

    // Draw line
    doc.moveTo(50, yPosition).lineTo(550, yPosition).stroke();
    yPosition += 10;

    // Order items
    order.items.forEach(item => {
      const productName = item.variantId.productId.productName;
      const brand = item.variantId.productId.brand;
      const color = item.variantId.color;
      
      doc.text(`${productName} (${brand}) - ${color}`, 50, yPosition);
      doc.text(item.quantity.toString(), 300, yPosition);
      doc.text(`₹${item.price.toFixed(2)}`, 350, yPosition);
      doc.text(`₹${item.totalPrice.toFixed(2)}`, 450, yPosition);
      yPosition += 20;
    });

    // Draw line
    yPosition += 10;
    doc.moveTo(50, yPosition).lineTo(550, yPosition).stroke();
    yPosition += 20;

    // Totals
    doc.text('Subtotal:', 350, yPosition);
    doc.text(`₹${order.subtotal.toFixed(2)}`, 450, yPosition);
    yPosition += 15;

    doc.text('Shipping:', 350, yPosition);
    doc.text(`₹${order.shippingCost.toFixed(2)}`, 450, yPosition);
    yPosition += 15;

    doc.text('Tax:', 350, yPosition);
    doc.text(`₹${order.taxAmount.toFixed(2)}`, 450, yPosition);
    yPosition += 15;

    if (order.discountAmount > 0) {
      doc.text('Discount:', 350, yPosition);
      doc.text(`-₹${order.discountAmount.toFixed(2)}`, 450, yPosition);
      yPosition += 15;
    }

    // Draw line
    doc.moveTo(350, yPosition).lineTo(550, yPosition).stroke();
    yPosition += 10;

    // Total
    doc.fontSize(12).text('Total Amount:', 350, yPosition);
    doc.text(`₹${order.totalAmount.toFixed(2)}`, 450, yPosition);

    // Payment method
    yPosition += 30;
    doc.fontSize(10).text(`Payment Method: ${order.paymentMethod}`, 50, yPosition);
    doc.text(`Order Status: ${order.orderStatus}`, 50, yPosition + 15);

    // Footer
    doc.text('Thank you for your business!', 50, yPosition + 50);

    // Finalize PDF
    doc.end();

  } catch (error) {
    console.error('Download invoice error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate invoice'
    });
  }
};

const returnOrderItem = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { variantId, quantity, reason, comments } = req.body;
    const userId = req.session.user.id;

    console.log('Return item request:', { orderId, variantId, quantity, reason, comments, userId });
    console.log('User session:', req.session.user);

    // Validate required fields
    if (!reason) {
      return res.status(400).json({
        success: false,
        message: 'Return reason is required'
      });
    }

    // Find the order
    const order = await Order.findOne({ _id: orderId, userId });
    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    // Find the specific item
    const item = order.items.find(item => 
      item.variantId.toString() === variantId.toString()
    );

    if (!item) {
      return res.status(404).json({
        success: false,
        message: 'Item not found in order'
      });
    }

    // Check if item is delivered
    console.log('Item status:', item.status);
    console.log('Item status type:', typeof item.status);
    
    if (item.status !== 'Delivered') {
      return res.status(400).json({
        success: false,
        message: `Only delivered items can be returned. Current status: ${item.status}`
      });
    }

    // Check if item is already returned
    if (item.status === 'Returned') {
      return res.status(400).json({
        success: false,
        message: 'Item is already returned'
      });
    }

    // Update item status to returned
    item.status = 'Returned';
    item.returnedAt = new Date();
    item.returnReason = reason;
    if (comments) {
      item.returnComments = comments;
    }
    
    // Add to status history
    if (!item.statusHistory) {
      item.statusHistory = [];
    }
    item.statusHistory.push({
      status: 'Returned',
      updatedAt: new Date(),
      reason: `Customer return: ${reason}${comments ? ` - ${comments}` : ''}`
    });

    console.log('Attempting to save order with return...');
    await order.save();
    console.log('Order saved successfully');

    console.log('Item return processed successfully');

    res.json({
      success: true,
      message: 'Return request submitted successfully'
    });

  } catch (error) {
    console.error('Return item error:', error);
    console.error('Error details:', error.message);
    console.error('Error stack:', error.stack);
    res.status(500).json({
      success: false,
      message: `Failed to process return request: ${error.message}`
    });
  }
};

export { getOrders, getOrderDetails, cancelOrder, cancelOrderItems, returnOrder, returnOrderItem, downloadInvoice };

// Default export for compatibility
export default {
  getOrders,
  getOrderDetails,
  cancelOrder,
  cancelOrderItems,
  returnOrder,
  returnOrderItem,
  downloadInvoice
};