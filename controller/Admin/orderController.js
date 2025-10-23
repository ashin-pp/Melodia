const Order = require('../../model/orderSchema');
const User = require('../../model/userSchema');
const Variant = require('../../model/variantSchema');
const Product = require('../../model/productSchema');
const puppeteer = require('puppeteer');

exports.listOrder = async (req, res) => {
    try {
        const { page = 1, limit = 10, search = '', status = 'all', sortBy = 'orderDate', order = 'desc' } = req.query;
        const skip = (page - 1) * limit;

        let query = {};

        if (search) {
            const user = await User.find({
                $or: [
                    { fullName: { $regex: search, $options: 'i' } },
                    { email: { $regex: search, $options: 'i' } },
                    { phoneNumber: { $regex: search, $options: 'i' } }
                ]
            }).select('_id');

            query = {
                $or: [
                    { orderId: { $regex: search, $options: 'i' } },
                    { userId: { $in: user.map(u => u._id) } }
                ]
            };
        }

        if (status && status !== 'all') {
            query.orderStatus = status;
        }

        const total = await Order.countDocuments(query);
        const totalPages = Math.ceil(total / limit);

        const orders = await Order.find(query)
            .populate('userId', 'fullName email phoneNumber')
            .sort({ [sortBy]: order === 'desc' ? -1 : 1 })
            .skip(parseInt(skip))
            .limit(parseInt(limit));

        const processedOrders = orders.map(order => ({
            id: order._id,
            referenceNo: order.orderId,
            orderDate: order.orderDate,
            status: order.orderStatus,
            total: order.totalAmount,
            paymentMethod: order.paymentMethod,
            itemCount: order.items ? order.items.length : 0,
            user: {
                id: order.userId?._id,
                name: order.userId?.fullName || order.shippingAddress?.fullName || 'N/A',
                email: order.userId?.email || 'N/A',
                phone: order.userId?.phoneNumber || order.shippingAddress?.phoneNumber || 'N/A'
            },
            createdAt: order.createdAt,
            updatedAt: order.updatedAt
        }));

        return res.json({
            success: true,
            data: {
                orders: processedOrders,
                pagination: {
                    currentPage: parseInt(page),
                    totalPages,
                    totalOrders: total,
                    limit: parseInt(limit),
                    hasNext: page < totalPages,
                    hasPrev: page > 1
                },
                filters: {
                    search,
                    status,
                    sortBy,
                    order
                }
            }
        });
    } catch (error) {
        console.error('Admin list orders API error:', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to fetch orders'
        });
    }
};

exports.renderOrdersPage = async (req, res) => {
    try {
        res.render('admin/orders');
    } catch (error) {
        console.error('Render orders page error:', error);
        res.status(500).send('Server Error');
    }
};



exports.getAdminOrderDetails = async (req, res) => {
    console.log('🔍 ===== ADMIN ORDER DETAILS DEBUG START =====');
    console.log('📍 Function called at:', new Date().toISOString());
    console.log('🌐 Request URL:', req.url);
    console.log('📋 Request method:', req.method);
    console.log('🆔 Order ID from params:', req.params.orderId);
    console.log('👤 Admin session:', req.session?.admin ? 'EXISTS' : 'MISSING');
    console.log('🔑 Session ID:', req.sessionID);

    try {
        const orderId = req.params.orderId;
        console.log('✅ Order ID extracted:', orderId);

        // Validate ObjectId
        const mongoose = require('mongoose');
        if (!mongoose.Types.ObjectId.isValid(orderId)) {
            console.log('❌ Invalid ObjectId format:', orderId);
            return res.send(`
                <html>
                <head><title>Invalid Order ID</title></head>
                <body style="font-family: Arial; padding: 20px;">
                    <h1>❌ Invalid Order ID Format</h1>
                    <p>Order ID: ${orderId}</p>
                    <p>Expected: 24 character hex string</p>
                    <a href="/admin/orders">← Back to Orders</a>
                </body>
                </html>
            `);
        }
        console.log('✅ ObjectId validation passed');

        console.log('🔍 Searching database for order...');
        const order = await Order.findById(orderId)
            .populate('userId', 'fullName email phoneNumber')
            .populate({
                path: 'items.variantId',
                select: 'color images',
                populate: {
                    path: 'productId',
                    select: 'productName brand images'
                }
            })
            .populate({
                path: 'cancelledItems.variantId',
                select: 'color images',
                populate: {
                    path: 'productId',
                    select: 'productName brand images'
                }
            });

        console.log('📊 Database query result:', order ? 'ORDER FOUND' : 'ORDER NOT FOUND');

        if (order) {
            console.log('📋 Order details:');
            console.log('  - Order ID:', order.orderId);
            console.log('  - Status:', order.orderStatus);
            console.log('  - Items count:', order.items?.length || 0);
            console.log('  - Customer:', order.userId?.fullName || 'N/A');
            console.log('  - Total:', order.totalAmount);
        }

        if (!order) {
            console.log('❌ Order not found in database');
            return res.send(`
                <html>
                <head><title>Order Not Found</title></head>
                <body style="font-family: Arial; padding: 20px;">
                    <h1>❌ Order Not Found</h1>
                    <p>Order ID: ${orderId}</p>
                    <p>No order exists with this ID in the database</p>
                    <a href="/admin/orders">← Back to Orders</a>
                </body>
                </html>
            `);
        }

        console.log('🎨 Rendering original EJS template with full functionality');
        
        res.render('admin/order-details', {
            order: order,
            title: `Admin - Order #${order.orderId}`
        });
        
        console.log('✅ EJS template rendered successfully');
        console.log('🔍 ===== ADMIN ORDER DETAILS DEBUG END =====');

    } catch (error) {
        console.log('💥 ===== ERROR OCCURRED =====');
        console.error('❌ Error type:', error.name);
        console.error('❌ Error message:', error.message);
        console.error('❌ Error stack:', error.stack);
        console.log('💥 ===== ERROR END =====');

        res.send(`
            <html>
            <head><title>Server Error - Debug Info</title></head>
            <body style="font-family: Arial; padding: 20px; background: #ffe6e6;">
                <h1>🚨 Server Error - Debug Information</h1>
                <div style="background: white; padding: 15px; border-radius: 5px; margin: 10px 0;">
                    <h3>Error Details:</h3>
                    <p><strong>Type:</strong> ${error.name}</p>
                    <p><strong>Message:</strong> ${error.message}</p>
                    <p><strong>Time:</strong> ${new Date().toISOString()}</p>
                </div>
                <div style="background: #f0f0f0; padding: 15px; border-radius: 5px; margin: 10px 0;">
                    <h3>Request Info:</h3>
                    <p><strong>URL:</strong> ${req.url}</p>
                    <p><strong>Order ID:</strong> ${req.params.orderId}</p>
                    <p><strong>Method:</strong> ${req.method}</p>
                </div>
                <pre style="background: #f5f5f5; padding: 10px; border-radius: 5px; overflow: auto;">${error.stack}</pre>
                <a href="/admin/orders" style="background: #007bff; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">← Back to Orders</a>
            </body>
            </html>
        `);
    }
};

exports.updateItemStatus = async (req, res) => {
    try {
        const { itemId } = req.params;
        const { status, reason } = req.body;

        const validStatuses = ['Pending', 'Confirmed', 'Processing', 'Shipped', 'Out for Delivery', 'Delivered', 'Cancelled', 'Returned'];

        if (!validStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid status. Valid statuses are: ' + validStatuses.join(', ')
            });
        }

        // Find the order that contains this item
        const order = await Order.findOne({ 'items._id': itemId });
        if (!order) {
            return res.status(404).json({
                success: false,
                error: 'Order item not found'
            });
        }

        // Find and update the specific item
        const item = order.items.id(itemId);
        if (!item) {
            return res.status(404).json({
                success: false,
                error: 'Item not found in order'
            });
        }

        console.log('Updating item:', itemId, 'from', item.status, 'to', status);

        const oldStatus = item.status || order.orderStatus || 'Pending';
        item.status = status;

        // Add status history
        if (!item.statusHistory) {
            item.statusHistory = [];
        }
        item.statusHistory.push({
            status: status,
            updatedAt: new Date(),
            reason: reason || null
        });

        // Set specific date fields based on status
        if (status === 'Delivered') {
            item.deliveredAt = new Date();
        } else if (status === 'Cancelled') {
            item.cancelledAt = new Date();
            if (reason) item.cancellationReason = reason;
        } else if (status === 'Returned') {
            item.returnedAt = new Date();
            if (reason) item.returnReason = reason;
        }

        await order.save();
        console.log('Item status updated successfully');

        return res.json({
            success: true,
            message: `Item status updated from ${oldStatus} to ${status}`,
            data: {
                itemId: item._id,
                status: item.status,
                oldStatus
            }
        });
    } catch (error) {
        console.error('Update item status error:', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to update item status'
        });
    }
};

// Inventory Management Functions
exports.renderInventoryPage = async (req, res) => {
    try {
        res.render('admin/inventory');
    } catch (error) {
        console.error('Render inventory page error:', error);
        res.status(500).send('Server Error');
    }
};

exports.getInventory = async (req, res) => {
    try {
        const { page = 1, limit = 20, search = '', stockFilter = '', sortBy = 'stock', order = 'asc' } = req.query;
        const skip = (page - 1) * limit;

        let query = {};

        if (search) {
            const products = await Product.find({
                productName: { $regex: search, $options: 'i' }
            }).select('_id');

            query.productId = { $in: products.map(p => p._id) };
        }

        if (stockFilter) {
            switch (stockFilter) {
                case 'low':
                    query.stock = { $lte: 10 };
                    break;
                case 'out':
                    query.stock = 0;
                    break;
                case 'available':
                    query.stock = { $gt: 0 };
                    break;
            }
        }

        const total = await Variant.countDocuments(query);
        const totalPages = Math.ceil(total / limit);

        const variants = await Variant.find(query)
            .populate('productId', 'productName brand images categoryId')
            .sort({ [sortBy]: order === 'desc' ? -1 : 1 })
            .skip(parseInt(skip))
            .limit(parseInt(limit));

        const stockStats = await Variant.aggregate([
            {
                $group: {
                    _id: null,
                    totalVariants: { $sum: 1 },
                    totalStock: { $sum: '$stock' },
                    lowStock: {
                        $sum: {
                            $cond: [{ $lte: ['$stock', 10] }, 1, 0]
                        }
                    },
                    outOfStock: {
                        $sum: {
                            $cond: [{ $eq: ['$stock', 0] }, 1, 0]
                        }
                    }
                }
            }
        ]);

        const processedVariants = variants.map(variant => ({
            id: variant._id,
            productName: variant.productId?.productName || 'Unknown Product',
            brand: variant.productId?.brand || 'Unknown Brand',
            color: variant.color,
            size: variant.size,
            stock: variant.stock,
            images: variant.productId?.images || [],
            categoryId: variant.productId?.categoryId
        }));

        return res.json({
            success: true,
            data: {
                variants: processedVariants,
                pagination: {
                    currentPage: parseInt(page),
                    totalPages,
                    totalVariants: total,
                    limit: parseInt(limit),
                    hasNext: page < totalPages,
                    hasPrev: page > 1
                },
                stockStats: stockStats[0] || { totalVariants: 0, totalStock: 0, lowStock: 0, outOfStock: 0 },
                filters: {
                    search,
                    stockFilter,
                    sortBy,
                    order
                }
            }
        });
    } catch (error) {
        console.error('Get inventory error:', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to fetch inventory'
        });
    }
};

exports.updateStock = async (req, res) => {
    try {
        const { variantId } = req.params;
        const { stock } = req.body;

        if (stock < 0) {
            return res.status(400).json({
                success: false,
                error: 'Stock cannot be negative'
            });
        }

        const variant = await Variant.findByIdAndUpdate(
            variantId,
            { stock: parseInt(stock) },
            { new: true }
        ).populate('productId', 'productName');

        if (!variant) {
            return res.status(404).json({
                success: false,
                error: 'Variant not found'
            });
        }

        return res.json({
            success: true,
            message: 'Stock updated successfully',
            data: {
                variantId: variant._id,
                stock: variant.stock,
                productName: variant.productId?.productName || 'Unknown Product'
            }
        });
    } catch (error) {
        console.error('Update stock error:', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to update stock'
        });
    }
};



// Global browser instance for reuse
let globalBrowser = null;

const getBrowser = async () => {
  if (!globalBrowser || !globalBrowser.isConnected()) {
    globalBrowser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox', 
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding'
      ]
    });
  }
  return globalBrowser;
};

exports.downloadInvoice = async (req, res) => {
  try {
    const orderId = req.params.orderId;
    
    // Set response headers for PDF download
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Invoice-${orderId}.pdf"`);
    res.setHeader('Cache-Control', 'no-cache');
    
    // Fetch order details with minimal fields for faster query
    const order = await Order.findById(orderId)
      .populate('userId', 'name email phone')
      .populate({
        path: 'items.variantId',
        select: 'color',
        populate: {
          path: 'productId',
          select: 'productName brand'
        }
      })
      .lean(); // Use lean() for faster queries

    if (!order) {
      return res.status(404).json({ success: false, error: 'Order not found' });
    }

    // Generate optimized HTML for invoice (removed heavy styling for speed)
    const invoiceHTML = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Invoice - ${order.orderId}</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 20px; }
        .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #000; padding-bottom: 20px; }
        .company-name { font-size: 28px; font-weight: bold; color: #000; }
        .invoice-title { font-size: 24px; margin: 20px 0; }
        .order-info { display: flex; justify-content: space-between; margin: 20px 0; }
        .customer-info { margin: 20px 0; }
        .items-table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        .items-table th, .items-table td { border: 1px solid #ddd; padding: 12px; text-align: left; }
        .items-table th { background-color: #f8f9fa; font-weight: bold; }
        .total-section { margin-top: 30px; text-align: right; }
        .total-row { margin: 5px 0; }
        .grand-total { font-size: 18px; font-weight: bold; border-top: 2px solid #000; padding-top: 10px; }
        .footer { margin-top: 50px; text-align: center; font-size: 12px; color: #666; }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="company-name">MELODIA</div>
        <div>Premium Audio Store</div>
      </div>
      
      <div class="invoice-title">INVOICE</div>
      
      <div class="order-info">
        <div>
          <strong>Invoice No:</strong> INV-${order.orderId}<br>
          <strong>Order Date:</strong> ${new Date(order.orderDate).toLocaleDateString()}<br>
          <strong>Payment Method:</strong> ${order.paymentMethod}
        </div>
        <div>
          <strong>Bill To:</strong><br>
          ${order.userId?.name || order.shippingAddress?.fullName}<br>
          ${order.userId?.email || ''}<br>
          ${order.userId?.phone || order.shippingAddress?.phoneNumber || ''}
        </div>
      </div>
      
      ${order.shippingAddress ? `
      <div class="customer-info">
        <strong>Shipping Address:</strong><br>
        ${order.shippingAddress.fullName}<br>
        ${order.shippingAddress.address}<br>
        ${order.shippingAddress.city}, ${order.shippingAddress.state} - ${order.shippingAddress.pincode}
      </div>
      ` : ''}
      
      <table class="items-table">
        <thead>
          <tr>
            <th>Item</th>
            <th>Quantity</th>
            <th>Unit Price</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          ${order.items.map(item => `
            <tr>
              <td>
                ${item.variantId?.productId?.productName || item.productName || 'Product'}<br>
                <small>Color: ${item.variantId?.color || item.color || 'N/A'}</small>
              </td>
              <td>${item.quantity}</td>
              <td>₹${item.price.toLocaleString()}</td>
              <td>₹${(item.quantity * item.price).toLocaleString()}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      
      <div class="total-section">
        <div class="total-row">Subtotal: ₹${(order.totalAmount - (order.deliveryCharge || 0)).toLocaleString()}</div>
        <div class="total-row">Delivery Charge: ₹${(order.deliveryCharge || 0).toLocaleString()}</div>
        <div class="total-row grand-total">Grand Total: ₹${order.totalAmount.toLocaleString()}</div>
      </div>
      
      <div class="footer">
        <p>Thank you for shopping with Melodia!</p>
        <p>For any queries, contact us at support@melodia.com</p>
      </div>
    </body>
    </html>
    `;

    // Generate PDF using optimized browser instance
    const browser = await getBrowser();
    const page = await browser.newPage();
    
    // Optimize page settings for speed
    await page.setViewport({ width: 794, height: 1123 }); // A4 size
    await page.setContent(invoiceHTML, { 
      waitUntil: 'domcontentloaded', // Faster than networkidle0
      timeout: 10000 
    });
    
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '15px', right: '15px', bottom: '15px', left: '15px' },
      preferCSSPageSize: false
    });
    
    await page.close(); // Close page but keep browser open for reuse

    // Send PDF buffer to client
    res.setHeader('Content-Length', pdfBuffer.length);
    res.end(pdfBuffer);

  } catch (error) {
    console.error('Invoice generation error:', error.message);
    
    // Provide appropriate error response
    if (error.message.includes('puppeteer') || error.message.includes('browser')) {
      res.status(500).json({ 
        success: false, 
        error: 'PDF generation service is temporarily unavailable. Please try again later.' 
      });
    } else {
      res.status(500).json({ 
        success: false, 
        error: 'Failed to generate invoice. Please try again later.' 
      });
    }
  }
};

module.exports = exports;