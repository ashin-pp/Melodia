import Order from '../../model/orderSchema.js';
import Variant from '../../model/variantSchema.js';
import User from '../../model/userSchema.js';
import Cart from '../../model/cartSchema.js';
import PDFDocument from 'pdfkit';
import mongoose from 'mongoose';
import walletService from '../../services/walletService.js';

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
    console.log('=== USER ORDER CANCELLATION STARTED ===');
    const userId = req.session.user.id;
    const orderId = req.params.orderId;
    const { reason } = req.body;
    
    console.log('Cancellation request:', { userId, orderId, reason });

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

    // Reload the order to get the updated data
    const updatedOrder = await Order.findById(orderId);
    
    // Process automatic refund for paid orders (NOT COD)
    console.log('=== CHECKING REFUND ELIGIBILITY ===');
    console.log('Original order details:', {
      orderId: order.orderId,
      paymentMethod: order.paymentMethod,
      paymentStatus: order.paymentStatus,
      totalAmount: order.totalAmount,
      walletAmountUsed: order.walletAmountUsed,
      orderStatus: order.orderStatus
    });
    console.log('Updated order details:', {
      orderId: updatedOrder.orderId,
      paymentMethod: updatedOrder.paymentMethod,
      paymentStatus: updatedOrder.paymentStatus,
      totalAmount: updatedOrder.totalAmount,
      walletAmountUsed: updatedOrder.walletAmountUsed,
      orderStatus: updatedOrder.orderStatus
    });
    

    
    // Use the updated order for refund processing
    const orderForRefund = updatedOrder || order;
    
    if (orderForRefund.paymentStatus === 'Paid' && orderForRefund.paymentMethod !== 'COD') {
      console.log('✅ Order eligible for refund - processing...');
      console.log('DEBUG: About to call wallet service with:', {
        userId,
        amount: orderForRefund.totalAmount,
        orderId: orderForRefund._id
      });
      
      // Validate user ID
      if (!userId) {
        throw new Error('User ID is missing from session');
      }
      
      // Verify user exists
      const User = (await import('../../model/userSchema.js')).default;
      const user = await User.findById(userId);
      if (!user) {
        throw new Error(`User not found with ID: ${userId}`);
      }
      
      console.log('DEBUG: User validation passed:', {
        userId: user._id,
        userName: user.name || user.fullName || 'No name',
        hasWallet: !!user.wallet
      });
      
      try {
        // Use wallet service for reliable refund processing
        const walletService = (await import('../../services/walletService.js')).default;
        
        console.log('DEBUG: Wallet service imported successfully');
        
        const refundResult = await walletService.addMoney(
          userId,
          orderForRefund.totalAmount,
          `Refund for cancelled order ${orderForRefund.orderId}`,
          orderForRefund._id
        );

        console.log('DEBUG: Wallet service returned:', refundResult);

        if (refundResult.success) {
          // Update order refund status
          orderForRefund.refundStatus = 'processed';
          orderForRefund.refundAmount = orderForRefund.totalAmount;
          orderForRefund.refundProcessedAt = new Date();
          await orderForRefund.save();
          
          console.log('✅ REFUND SUCCESSFUL:', {
            refundAmount: orderForRefund.totalAmount,
            newBalance: refundResult.newBalance,
            transactionId: refundResult.transactionId
          });
          
          res.json({
            success: true,
            message: 'Order cancelled and refund processed successfully',
            refund: {
              amount: orderForRefund.totalAmount,
              newWalletBalance: refundResult.newBalance,
              transactionId: refundResult.transactionId
            }
          });
        } else {
          console.error('DEBUG: Wallet service failed, trying direct approach');
          console.error('Wallet service error:', refundResult.error);
          
          // Fallback: Direct wallet credit - FORCE SUCCESS
          console.log('FORCING DIRECT WALLET CREDIT...');
          
          if (!user.wallet) {
            console.log('Creating new wallet for user');
            user.wallet = { balance: 0, transactions: [], isWalletActive: true };
          }
          
          const oldBalance = user.wallet.balance || 0;
          const newBalance = oldBalance + orderForRefund.totalAmount;
          const transactionId = `REFUND${Date.now()}`;
          
          console.log('Direct refund calculation:', {
            oldBalance,
            refundAmount: orderForRefund.totalAmount,
            newBalance
          });
          
          const transaction = {
            type: 'credit',
            amount: orderForRefund.totalAmount,
            description: `Refund for cancelled order ${orderForRefund.orderId}`,
            orderId: orderForRefund._id,
            transactionId: transactionId,
            balanceAfter: newBalance,
            createdAt: new Date()
          };
          
          user.wallet.balance = newBalance;
          user.wallet.transactions.push(transaction);
          
          console.log('Saving user with updated wallet...');
          const savedUser = await user.save();
          console.log('User saved. New wallet balance:', savedUser.wallet.balance);
          
          // Update order refund status
          orderForRefund.refundStatus = 'processed';
          orderForRefund.refundAmount = orderForRefund.totalAmount;
          orderForRefund.refundProcessedAt = new Date();
          await orderForRefund.save();
          
          console.log('✅ DIRECT REFUND SUCCESSFUL:', {
            refundAmount: orderForRefund.totalAmount,
            newBalance: savedUser.wallet.balance,
            transactionId: transactionId
          });
          
          res.json({
            success: true,
            message: 'Order cancelled and refund processed successfully (direct method)',
            refund: {
              amount: orderForRefund.totalAmount,
              newWalletBalance: savedUser.wallet.balance,
              transactionId: transactionId
            }
          });
        }
        
      } catch (refundError) {
        console.error('❌ REFUND ERROR:', refundError);
        console.error('DEBUG: Full error details:', {
          name: refundError.name,
          message: refundError.message,
          stack: refundError.stack
        });
        res.json({
          success: true,
          message: 'Order cancelled successfully, but refund failed. Please contact support.',
          refundError: refundError.message
        });
      }
    } else {
      console.log('❌ Order not eligible for refund:', {
        paymentStatus: orderForRefund.paymentStatus,
        paymentMethod: orderForRefund.paymentMethod,
        reason: orderForRefund.paymentStatus !== 'Paid' ? 'Not paid' : 'COD order'
      });
      
      res.json({
        success: true,
        message: 'Order cancelled successfully'
      });
    }



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

    // Get updated order to see new totals
    const updatedOrder = await Order.findById(orderId);
    console.log('Updated order totals:', {
      originalTotal: order.totalAmount,
      newTotal: updatedOrder.totalAmount,
      difference: order.totalAmount - updatedOrder.totalAmount
    });

    // Process partial refund for cancelled items
    try {
      if (order.paymentStatus === 'Paid' && order.paymentMethod !== 'COD') {
        const originalTotal = order.totalAmount;
        const newTotal = updatedOrder.totalAmount;
        const refundAmount = originalTotal - newTotal;

        console.log('Refund calculation:', {
          originalTotal,
          newTotal,
          refundAmount
        });

        if (refundAmount > 0) {
          console.log('Processing user item cancellation refund:', {
            userId,
            refundAmount,
            orderId: order.orderId
          });
          
          // Use wallet service for reliable refund processing
          const walletService = (await import('../../services/walletService.js')).default;
          
          const refundResult = await walletService.addMoney(
            userId,
            refundAmount,
            `Partial refund for cancelled items - Order ${order.orderId}`,
            order._id
          );

          if (refundResult.success) {
            console.log('Item refund successful:', {
              refundAmount,
              newBalance: refundResult.newBalance,
              transactionId: refundResult.transactionId
            });

            res.json({
              success: true,
              message: 'Items cancelled successfully',
              orderUpdate: {
                originalTotal,
                newTotal,
                refundAmount
              },
              refund: {
                amount: refundAmount,
                newWalletBalance: refundResult.newBalance,
                transactionId: refundResult.transactionId
              }
            });
          } else {
            console.error('Wallet service failed for item refund, trying direct approach');
            
            // Fallback: Direct wallet credit
            const User = (await import('../../model/userSchema.js')).default;
            const user = await User.findById(userId);
            
            if (!user.wallet) {
              user.wallet = { balance: 0, transactions: [], isWalletActive: true };
            }
            
            const oldBalance = user.wallet.balance || 0;
            const newBalance = oldBalance + refundAmount;
            const transactionId = `ITEMREFUND${Date.now()}`;
            
            const transaction = {
              type: 'credit',
              amount: refundAmount,
              description: `Partial refund for cancelled items - Order ${order.orderId}`,
              orderId: order._id,
              transactionId: transactionId,
              balanceAfter: newBalance,
              createdAt: new Date()
            };
            
            user.wallet.balance = newBalance;
            user.wallet.transactions.push(transaction);
            await user.save();
            
            console.log('Direct item refund successful:', {
              refundAmount,
              newBalance: newBalance,
              transactionId: transactionId
            });

            res.json({
              success: true,
              message: 'Items cancelled successfully',
              orderUpdate: {
                originalTotal,
                newTotal,
                refundAmount
              },
              refund: {
                amount: refundAmount,
                newWalletBalance: newBalance,
                transactionId: transactionId
              }
            });
          }
        } else {
          res.json({
            success: true,
            message: 'Items cancelled successfully',
            orderUpdate: {
              originalTotal,
              newTotal
            }
          });
        }
      } else {
        res.json({
          success: true,
          message: 'Items cancelled successfully',
          orderUpdate: {
            originalTotal: order.totalAmount,
            newTotal: updatedOrder.totalAmount
          }
        });
      }
    } catch (refundError) {
      console.error('Partial refund processing error:', refundError);
      res.json({
        success: true,
        message: 'Items cancelled successfully, but refund processing failed. Please contact support.',
        refundError: refundError.message,
        orderUpdate: {
          originalTotal: order.totalAmount,
          newTotal: updatedOrder.totalAmount
        }
      });
    }

  } catch (error) {
    console.error('Cancel order items error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to cancel items'
    });
  }
};

// Create return request for entire order
const returnOrder = async (req, res) => {
  try {
    console.log('=== RETURN ORDER REQUEST ===');
    const userId = req.session.user.id;
    const orderId = req.params.orderId;
    const { reason, images } = req.body;

    console.log('Return request details:', { userId, orderId, reason, hasImages: !!images });

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
      console.log('Order not found:', orderId);
      return res.status(404).json({
        success: false,
        message: 'Order not found'
      });
    }

    console.log('Order found:', {
      orderId: order.orderId,
      orderStatus: order.orderStatus,
      deliveredDate: order.deliveredDate,
      hasReturnRequests: order.returnRequests && order.returnRequests.length > 0
    });

    // Check if order can be returned
    if (order.orderStatus !== 'Delivered') {
      return res.status(400).json({
        success: false,
        message: 'Only delivered orders can be returned'
      });
    }

    // Check if return window is still open (e.g., 7 days)
    const returnWindow = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds
    let timeSinceDelivery = 0;
    
    if (order.deliveredDate) {
      timeSinceDelivery = Date.now() - order.deliveredDate.getTime();
      console.log('Time since delivery (days):', timeSinceDelivery / (24 * 60 * 60 * 1000));
    } else {
      console.log('No deliveredDate found, using current time');
      // If no deliveredDate, assume it was just delivered (allow return)
      timeSinceDelivery = 0;
    }
    
    if (timeSinceDelivery > returnWindow) {
      return res.status(400).json({
        success: false,
        message: 'Return window has expired. Returns are only allowed within 7 days of delivery.'
      });
    }

    // Check if return request already exists for this order
    if (order.returnRequests && order.returnRequests.length > 0) {
      const existingReturns = order.returnRequests.filter(req => 
        req.status === 'pending' || req.status === 'approved'
      );
      if (existingReturns.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'Return request already exists for this order'
        });
      }
    }

    // Create return requests for all items
    const returnRequests = order.items.map(item => ({
      itemId: item._id,
      reason: reason,
      status: 'pending',
      requestedAt: new Date(),
      refundAmount: item.totalPrice,
      images: images || []
    }));

    console.log('Creating return requests for', returnRequests.length, 'items');

    // Add return requests to order
    await Order.findByIdAndUpdate(orderId, {
      $push: { returnRequests: { $each: returnRequests } },
      $set: { refundStatus: 'pending' }
    });

    console.log('Return requests created successfully');

    res.json({
      success: true,
      message: 'Return request submitted successfully. Admin will review and process your request.'
    });

  } catch (error) {
    console.error('=== RETURN ORDER ERROR ===');
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    res.status(500).json({
      success: false,
      message: 'Failed to submit return request: ' + error.message
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

    // Order items (only active items, excluding cancelled and returned ones)
    const activeItems = order.items.filter(item => item.status !== 'Cancelled' && item.status !== 'Returned');
    
    activeItems.forEach(item => {
      const productName = item.variantId.productId.productName;
      const brand = item.variantId.productId.brand;
      const color = item.variantId.color;
      
      doc.text(`${productName} (${brand}) - ${color}`, 50, yPosition);
      doc.text(item.quantity.toString(), 300, yPosition);
      doc.text(`₹${item.price.toFixed(2)}`, 350, yPosition);
      doc.text(`₹${item.totalPrice.toFixed(2)}`, 450, yPosition);
      yPosition += 20;
    });

    // Show cancelled items if any
    const cancelledItems = order.items.filter(item => item.status === 'Cancelled');
    if (cancelledItems.length > 0) {
      yPosition += 10;
      doc.fontSize(10).fillColor('red').text('Cancelled Items:', 50, yPosition);
      yPosition += 15;
      
      cancelledItems.forEach(item => {
        const productName = item.variantId.productId.productName;
        const brand = item.variantId.productId.brand;
        const color = item.variantId.color;
        
        doc.fillColor('gray').text(`${productName} (${brand}) - ${color} [CANCELLED]`, 50, yPosition);
        doc.text(item.quantity.toString(), 300, yPosition);
        doc.text(`₹${item.price.toFixed(2)}`, 350, yPosition);
        doc.text(`-₹${item.totalPrice.toFixed(2)}`, 450, yPosition);
        yPosition += 15;
      });
      
      doc.fillColor('black'); // Reset color
    }

    // Show returned items if any
    const returnedItems = order.items.filter(item => item.status === 'Returned');
    if (returnedItems.length > 0) {
      yPosition += 10;
      doc.fontSize(10).fillColor('orange').text('Returned Items:', 50, yPosition);
      yPosition += 15;
      
      returnedItems.forEach(item => {
        const productName = item.variantId.productId.productName;
        const brand = item.variantId.productId.brand;
        const color = item.variantId.color;
        
        doc.fillColor('gray').text(`${productName} (${brand}) - ${color} [RETURNED]`, 50, yPosition);
        doc.text(item.quantity.toString(), 300, yPosition);
        doc.text(`₹${item.price.toFixed(2)}`, 350, yPosition);
        doc.text(`-₹${item.totalPrice.toFixed(2)}`, 450, yPosition);
        yPosition += 15;
      });
      
      doc.fillColor('black'); // Reset color
    }

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

    // Payment method and order info
    yPosition += 30;
    doc.fontSize(10).text(`Payment Method: ${order.paymentMethod}`, 50, yPosition);
    doc.text(`Order Status: ${order.orderStatus}`, 50, yPosition + 15);
    
    // Add return information if any
    if (order.returnRequests && order.returnRequests.length > 0) {
      yPosition += 40;
      doc.fontSize(12).text('Return Information:', 50, yPosition);
      yPosition += 20;
      
      order.returnRequests.forEach(returnReq => {
        const returnItem = order.items.find(item => item._id.toString() === returnReq.itemId.toString());
        if (returnItem) {
          doc.fontSize(10).text(`• Return Status: ${returnReq.status}`, 50, yPosition);
          doc.text(`  Reason: ${returnReq.reason}`, 50, yPosition + 12);
          doc.text(`  Requested: ${returnReq.requestedAt.toLocaleDateString()}`, 50, yPosition + 24);
          if (returnReq.processedAt) {
            doc.text(`  Processed: ${returnReq.processedAt.toLocaleDateString()}`, 50, yPosition + 36);
            yPosition += 48;
          } else {
            yPosition += 36;
          }
        }
      });
    }

    // Refund information if any
    if (order.refundStatus && order.refundStatus !== 'none') {
      yPosition += 20;
      doc.fontSize(12).text('Refund Information:', 50, yPosition);
      yPosition += 15;
      doc.fontSize(10).text(`Refund Status: ${order.refundStatus}`, 50, yPosition);
      if (order.refundAmount) {
        doc.text(`Refund Amount: ₹${order.refundAmount.toFixed(2)}`, 50, yPosition + 12);
        yPosition += 24;
      } else {
        yPosition += 12;
      }
      if (order.refundProcessedAt) {
        doc.text(`Refund Processed: ${order.refundProcessedAt.toLocaleDateString()}`, 50, yPosition);
        yPosition += 12;
      }
    }

    // Footer
    yPosition += 30;
    doc.text('Thank you for your business!', 50, yPosition);
    doc.text('For any queries regarding returns or refunds, contact us at support@melodia.com', 50, yPosition + 15);

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

// Create return request for specific item
const returnOrderItem = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { variantId, quantity, reason, comments, images } = req.body;
    const userId = req.session.user.id;

    console.log('Return item request:', { orderId, variantId, quantity, reason, comments, userId });

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
    if (item.status !== 'Delivered') {
      return res.status(400).json({
        success: false,
        message: `Only delivered items can be returned. Current status: ${item.status}`
      });
    }

    // Check if return window is still open (e.g., 7 days)
    const returnWindow = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds
    let timeSinceDelivery = 0;
    
    // Use item's deliveredAt date if available, otherwise use order's deliveredDate
    const deliveryDate = item.deliveredAt || order.deliveredDate;
    
    if (deliveryDate) {
      timeSinceDelivery = Date.now() - deliveryDate.getTime();
      console.log('Time since delivery (days):', timeSinceDelivery / (24 * 60 * 60 * 1000));
    } else {
      console.log('No delivery date found, using current time');
      // If no delivery date, assume it was just delivered (allow return)
      timeSinceDelivery = 0;
    }
    
    if (timeSinceDelivery > returnWindow) {
      return res.status(400).json({
        success: false,
        message: 'Return window has expired. Returns are only allowed within 7 days of delivery.'
      });
    }

    // Check if item already has a return request (pending or approved)
    const existingRequest = order.returnRequests.find(
      req => req.itemId.toString() === item._id.toString() && 
             (req.status === 'pending' || req.status === 'approved')
    );

    if (existingRequest) {
      return res.status(400).json({
        success: false,
        message: `Return request already ${existingRequest.status} for this item`
      });
    }

    // Calculate refund amount (proportional to quantity if partial return)
    const refundAmount = (item.totalPrice / item.quantity) * (quantity || item.quantity);

    // Create return request
    const returnRequest = {
      itemId: item._id,
      reason: reason,
      status: 'pending',
      requestedAt: new Date(),
      refundAmount: refundAmount,
      adminNotes: comments || '',
      images: images || []
    };

    // Add return request to order
    await Order.findByIdAndUpdate(orderId, {
      $push: { returnRequests: returnRequest }
    });

    res.json({
      success: true,
      message: 'Return request submitted successfully. Admin will review and process your request.',
      returnRequest: {
        itemId: item._id,
        refundAmount: refundAmount,
        status: 'pending'
      }
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

// Payment Success Page
const getPaymentSuccess = async (req, res) => {
  try {
    const order = await Order.findOne({ orderId: req.params.orderId });
    if (!order) {
      return res.redirect('/orders');
    }
    res.render('user/payment-success', { order, title: 'Payment Success - Melodia' });
  } catch (err) {
    console.error('Error loading success page:', err);
    res.redirect('/orders');
  }
};

// Payment Failure Page
const getPaymentFailure = async (req, res) => {
  try {
    const order = await Order.findOne({ orderId: req.params.orderId });
    res.render('user/payment-failure', {
      order,
      error: req.query.error ? JSON.parse(req.query.error) : null,
      title: 'Payment Failed - Melodia'
    });
  } catch (err) {
    console.error('Error loading failure page:', err);
    res.render('user/payment-failure', {
      order: null,
      error: null,
      title: 'Payment Failed - Melodia'
    });
  }
};

export { getOrders, getOrderDetails, cancelOrder, cancelOrderItems, returnOrder, returnOrderItem, downloadInvoice, getPaymentSuccess, getPaymentFailure };

// Default export for compatibility
export default {
  getOrders,
  getOrderDetails,
  cancelOrder,
  cancelOrderItems,
  returnOrder,
  returnOrderItem,
  downloadInvoice,
  getPaymentSuccess,
  getPaymentFailure
};