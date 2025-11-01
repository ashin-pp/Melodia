import mongoose from 'mongoose';
import Order from '../../model/orderSchema.js';
import User from '../../model/userSchema.js';
import Variant from '../../model/variantSchema.js';
import Product from '../../model/productSchema.js';
import puppeteer from 'puppeteer';

export const listOrder = async (req, res) => {
    try {
        const { page = 1, limit = 10, search = '', status = 'all', sortBy = 'orderDate', order = 'desc' } = req.query;
        const skip = (page - 1) * limit;

        let query = {};
        let searchConditions = [];
        let statusConditions = [];

        if (search && search.trim()) {

            
            // Search for users by name, email, or phone
            const users = await User.find({
                $or: [
                    { fullName: { $regex: search.trim(), $options: 'i' } },
                    { email: { $regex: search.trim(), $options: 'i' } },
                    { phone: { $regex: search.trim(), $options: 'i' } }
                ]
            }).select('_id name email phone');



            searchConditions = [
                { orderId: { $regex: search.trim(), $options: 'i' } }
            ];

            // Add user-based search if users found
            if (users.length > 0) {
                searchConditions.push({ userId: { $in: users.map(u => u._id) } });
            }


        }

        if (status && status !== 'all') {
            if (status === 'Cancelled') {
                // For cancelled status, check both order-level and item-level cancellations
                statusConditions = [
                    { orderStatus: 'Cancelled' },
                    { 'items.status': 'Cancelled' },
                    { 'cancelledItems.0': { $exists: true } } // Orders with cancelled items
                ];

            } else if (status === 'Partially Cancelled') {
                // For partially cancelled, find orders with some cancelled items but not fully cancelled
                statusConditions = [
                    {
                        $and: [
                            { 'cancelledItems.0': { $exists: true } }, // Has cancelled items
                            { orderStatus: { $ne: 'Cancelled' } } // But order is not fully cancelled
                        ]
                    }
                ];

            } else {
                // Check both order-level status and item-level status
                statusConditions = [
                    { orderStatus: status },
                    { 'items.status': status }
                ];
            }

        }

        // Combine search and status conditions
        if (searchConditions.length > 0 && statusConditions.length > 0) {
            query = {
                $and: [
                    { $or: searchConditions },
                    { $or: statusConditions }
                ]
            };
        } else if (searchConditions.length > 0) {
            query = { $or: searchConditions };
        } else if (statusConditions.length > 0) {
            query = { $or: statusConditions };
        }


        
        const total = await Order.countDocuments(query);

        const totalPages = Math.ceil(total / limit);

        const orders = await Order.find(query)
            .populate('userId', 'name email phone')
            .sort({ [sortBy]: order === 'desc' ? -1 : 1 })
            .skip(parseInt(skip))
            .limit(parseInt(limit));



        const processedOrders = orders.map(order => {
            // Check if order has cancelled items but order status is not cancelled
            const hasCancelledItems = (order.cancelledItems && order.cancelledItems.length > 0) ||
                (order.items && order.items.some(item => item.status === 'Cancelled'));

            // Determine display status
            let displayStatus = order.orderStatus;
            if (hasCancelledItems && order.orderStatus !== 'Cancelled') {
                // If order has cancelled items but order status is not cancelled, show as "Partially Cancelled"
                const allItemsCancelled = order.items && order.items.every(item => item.status === 'Cancelled' || item.quantity === 0);
                if (allItemsCancelled) {
                    displayStatus = 'Cancelled';
                } else {
                    displayStatus = 'Partially Cancelled';
                }
            }

            // Calculate correct display total (for wallet payments, add back wallet amount)
            const displayTotal = order.paymentMethod === 'WALLET' && order.totalAmount === 0
                ? (order.walletAmountUsed || 0)
                : order.totalAmount;

            return {
                id: order._id,
                referenceNo: order.orderId,
                orderDate: order.orderDate,
                status: displayStatus,
                originalStatus: order.orderStatus, // Keep original for debugging
                total: displayTotal,
                paymentMethod: order.paymentMethod,
                itemCount: order.items ? order.items.length : 0,
                cancelledItemCount: order.cancelledItems ? order.cancelledItems.length : 0,
                user: {
                    id: order.userId?._id,
                    name: order.userId?.name || order.shippingAddress?.fullName || 'N/A',
                    email: order.userId?.email || 'N/A',
                    phone: order.userId?.phone || order.shippingAddress?.phoneNumber || 'N/A'
                },
                createdAt: order.createdAt,
                updatedAt: order.updatedAt
            };
        });

        // Get overall statistics (not just current page)
        const stats = await getOrderStatistics();

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
                },
                stats: stats
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

export const renderOrdersPage = async (req, res) => {
    try {
        res.render('admin/orders');
    } catch (error) {
        console.error('Render orders page error:', error);
        res.status(500).send('Server Error');
    }
};

// Function to get order statistics
const getOrderStatistics = async () => {
    try {
        console.log('=== Getting Order Statistics ===');

        // First, let's see what order statuses exist in the database
        const allStatuses = await Order.distinct('orderStatus');
        console.log('All order statuses in database:', allStatuses);

        // Check item-level statuses
        const allItemStatuses = await Order.distinct('items.status');
        console.log('All item statuses in database:', allItemStatuses);

        // Find orders with delivered items
        const ordersWithDeliveredItems = await Order.find({ 'items.status': 'Delivered' })
            .select('orderId orderStatus items.status')
            .limit(5);
        console.log('Sample orders with delivered items:', ordersWithDeliveredItems.map(o => ({
            orderId: o.orderId,
            orderStatus: o.orderStatus,
            itemStatuses: o.items.map(item => item.status)
        })));

        // Get total orders count
        const totalOrders = await Order.countDocuments();
        console.log('Total orders:', totalOrders);

        // Get delivered orders count (both order-level and item-level)
        const deliveredOrdersByOrderStatus = await Order.countDocuments({ orderStatus: 'Delivered' });
        console.log('Delivered orders (order status):', deliveredOrdersByOrderStatus);

        // Count orders that have at least one delivered item
        const deliveredOrdersByItemStatus = await Order.countDocuments({
            'items.status': 'Delivered'
        });
        console.log('Orders with delivered items:', deliveredOrdersByItemStatus);

        // Let's also check for case-sensitive issues
        const deliveredOrdersInsensitive = await Order.countDocuments({
            orderStatus: { $regex: /^delivered$/i }
        });
        console.log('Delivered orders (case insensitive):', deliveredOrdersInsensitive);

        // Use the maximum of both counts
        const deliveredOrders = Math.max(deliveredOrdersByOrderStatus, deliveredOrdersByItemStatus, deliveredOrdersInsensitive);
        console.log('Final delivered orders count:', deliveredOrders);

        // Get pending orders count (including Confirmed and Processing)
        const pendingOrders = await Order.countDocuments({
            orderStatus: { $in: ['Pending', 'Confirmed', 'Processing'] }
        });
        console.log('Pending orders:', pendingOrders);

        // Get cancelled orders count
        const cancelledOrders = await Order.countDocuments({ orderStatus: 'Cancelled' });
        console.log('Cancelled orders:', cancelledOrders);

        // Debug: Let's see what cancelled orders exist
        const cancelledOrdersList = await Order.find({ orderStatus: 'Cancelled' })
            .select('orderId orderStatus cancelledAt')
            .limit(5);
        console.log('Sample cancelled orders:', cancelledOrdersList);

        // Get shipped orders count
        const shippedOrders = await Order.countDocuments({ orderStatus: 'Shipped' });
        console.log('Shipped orders:', shippedOrders);

        // Get out for delivery orders count
        const outForDeliveryOrders = await Order.countDocuments({ orderStatus: 'Out for Delivery' });
        console.log('Out for delivery orders:', outForDeliveryOrders);

        const stats = {
            totalOrders,
            deliveredOrders,
            pendingOrders,
            cancelledOrders,
            shippedOrders,
            outForDeliveryOrders
        };

        console.log('Final stats:', stats);
        return stats;
    } catch (error) {
        console.error('Error getting order statistics:', error);
        return {
            totalOrders: 0,
            deliveredOrders: 0,
            pendingOrders: 0,
            cancelledOrders: 0,
            shippedOrders: 0,
            outForDeliveryOrders: 0
        };
    }
};

export const getAdminOrderDetails = async (req, res) => {

    try {
        const orderId = req.params.orderId;
        console.log(' Order ID extracted:', orderId);

        console.log('Searching database for order...');
        let order;

        // Try to find by ObjectId first, then by orderId string
        if (mongoose.Types.ObjectId.isValid(orderId)) {
            console.log('Searching by ObjectId...');
            order = await Order.findById(orderId)
                .populate('userId', 'firstName lastName email phoneNumber')
                .populate({
                    path: 'items.variantId',
                    select: 'color images salePrice regularPrice',
                    populate: {
                        path: 'productId',
                        select: 'productName brand images description'
                    }
                })
                .populate({
                    path: 'cancelledItems.variantId',
                    select: 'color images salePrice regularPrice',
                    populate: {
                        path: 'productId',
                        select: 'productName brand images description'
                    }
                });
        } else {
            console.log(' Searching by orderId string...');
            order = await Order.findOne({ orderId: orderId })
                .populate('userId', 'firstName lastName email phoneNumber')
                .populate({
                    path: 'items.variantId',
                    select: 'color images salePrice regularPrice',
                    populate: {
                        path: 'productId',
                        select: 'productName brand images description'
                    }
                })
                .populate({
                    path: 'cancelledItems.variantId',
                    select: 'color images salePrice regularPrice',
                    populate: {
                        path: 'productId',
                        select: 'productName brand images description'
                    }
                });
        }


        console.log('📊 Database query result:', order ? 'ORDER FOUND' : 'ORDER NOT FOUND');

        if (order) {

            // Debug item statuses
            if (order.items && order.items.length > 0) {
                console.log('📦 Item statuses:');
                order.items.forEach((item, index) => {
                    console.log(`  Item ${index}: status=${item.status || 'undefined'}, variantId=${item.variantId?._id}`);
                });
            }

            // Debug cancelled items
            if (order.cancelledItems && order.cancelledItems.length > 0) {
                console.log('❌ Cancelled items:');
                order.cancelledItems.forEach((cancelled, index) => {
                    console.log(`  Cancelled ${index}: variantId=${cancelled.variantId?._id}, quantity=${cancelled.quantity}, reason=${cancelled.reason}`);
                });
            }
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

        // Calculate proper overall order status based on item statuses
        if (order.items && order.items.length > 0) {
            const itemStatuses = order.items.map(item => item.status);
            const allDelivered = itemStatuses.every(status => status === 'Delivered');
            const allCancelled = itemStatuses.every(status => status === 'Cancelled');
            const allReturned = itemStatuses.every(status => status === 'Returned');
            const hasDelivered = itemStatuses.some(status => status === 'Delivered');
            const hasCancelled = itemStatuses.some(status => status === 'Cancelled');
            const hasReturned = itemStatuses.some(status => status === 'Returned');
            
            // Update order status based on item statuses
            if (allDelivered) {
                order.orderStatus = 'Delivered';
            } else if (allCancelled) {
                order.orderStatus = 'Cancelled';
            } else if (allReturned) {
                order.orderStatus = 'Returned';
            } else if (hasDelivered && (hasCancelled || hasReturned)) {
                order.orderStatus = 'Partially Delivered';
            } else if (hasCancelled && !hasDelivered) {
                order.orderStatus = 'Partially Cancelled';
            }
            
            console.log('📊 Order status updated to:', order.orderStatus);
        }

        console.log(' Rendering original EJS template with full functionality');

        res.render('admin/order-details', {
            order: order,
            title: `Admin - Order #${order.orderId}`
        });

        console.log(' EJS template rendered successfully');
        console.log(' ===== ADMIN ORDER DETAILS DEBUG END =====');

    } catch (error) {
        console.log(' ===== ERROR OCCURRED =====');

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

// Update overall order status
export const updateOrderStatus = async (req, res) => {
    try {
        const { orderId } = req.params;
        const { status, reason } = req.body;

        console.log('=== UPDATE ORDER STATUS ===');
        console.log('Order ID:', orderId);
        console.log('New Status:', status);
        console.log('Reason:', reason);

        // Find the order
        const order = await Order.findById(orderId);
        if (!order) {
            return res.status(404).json({
                success: false,
                error: 'Order not found'
            });
        }

        const oldStatus = order.orderStatus;
        console.log('Current order status:', oldStatus);

        // Update order status
        order.orderStatus = status;

        // Set delivery date if status is Delivered
        if (status === 'Delivered' && !order.deliveredDate) {
            order.deliveredDate = new Date();
            console.log('Set delivery date:', order.deliveredDate);
        }

        // Update all items to the same status if they're not cancelled or returned
        order.items.forEach(item => {
            if (item.status !== 'Cancelled' && item.status !== 'Returned') {
                item.status = status;

                // Set item delivery date if status is Delivered
                if (status === 'Delivered' && !item.deliveredAt) {
                    item.deliveredAt = new Date();
                }

                // Add to status history
                if (!item.statusHistory) {
                    item.statusHistory = [];
                }
                item.statusHistory.push({
                    status: status,
                    updatedAt: new Date(),
                    reason: reason || `Order status changed to ${status}`
                });
            }
        });

        await order.save();
        console.log('Order status updated successfully');

        return res.json({
            success: true,
            message: `Order status updated from ${oldStatus} to ${status}`,
            data: {
                orderId: order._id,
                oldStatus,
                newStatus: status,
                deliveredDate: order.deliveredDate
            }
        });
    } catch (error) {
        console.error('Update order status error:', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to update order status'
        });
    }
};

export const updateItemStatus = async (req, res) => {
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
            
            // Add to cancelled items array for proper tracking
            const cancelledItem = {
                variantId: item.variantId,
                quantity: item.quantity,
                reason: reason || 'Cancelled by admin',
                cancelledAt: new Date()
            };
            
            if (!order.cancelledItems) {
                order.cancelledItems = [];
            }
            order.cancelledItems.push(cancelledItem);
            
            console.log('Item added to cancelled items list');
            
        } else if (status === 'Returned') {
            item.returnedAt = new Date();
            if (reason) item.returnReason = reason;
        }

        // Store original total for refund calculation
        const originalTotal = order.totalAmount;

        await order.save();
        console.log('Item status updated successfully');

        // Process refund if item was cancelled and order was paid (NOT COD)
        let refundResult = null;
        if (status === 'Cancelled' && order.paymentStatus === 'Paid' && order.paymentMethod !== 'COD') {
            try {
                console.log('Processing refund for cancelled item...');
                
                // Recalculate order totals after cancellation
                const activeTotal = order.getActiveTotal();
                const refundAmount = originalTotal - activeTotal.totalAmount;
                
                console.log('Refund calculation:', {
                    originalTotal,
                    newTotal: activeTotal.totalAmount,
                    refundAmount
                });

                if (refundAmount > 0) {
                    // Import walletService
                    const walletService = (await import('../../services/walletService.js')).default;
                    
                    refundResult = await walletService.addMoney(
                        order.userId,
                        refundAmount,
                        `Refund for admin cancelled item - Order ${order.orderId}`,
                        order._id
                    );

                    if (refundResult.success) {
                        console.log('Admin item cancellation refund processed successfully:', refundResult);
                        
                        // Update order totals
                        order.subtotal = activeTotal.subtotal;
                        order.shippingCost = activeTotal.shippingCost;
                        order.taxAmount = activeTotal.taxAmount;
                        order.totalAmount = activeTotal.totalAmount;
                        await order.save();
                    } else {
                        console.error('Admin item cancellation refund failed:', refundResult.error);
                    }
                }
            } catch (refundError) {
                console.error('Admin item cancellation refund error:', refundError);
            }
        }

        const responseData = {
            success: true,
            message: `Item status updated from ${oldStatus} to ${status}`,
            data: {
                itemId: item._id,
                status: item.status,
                oldStatus
            }
        };

        if (refundResult && refundResult.success) {
            responseData.refund = {
                amount: refundResult.transaction.amount,
                newWalletBalance: refundResult.newBalance,
                transactionId: refundResult.transactionId
            };
        }

        return res.json(responseData);
    } catch (error) {
        console.error('Update item status error:', error);
        return res.status(500).json({
            success: false,
            error: 'Failed to update item status'
        });
    }
};

// Inventory Management Functions
export const renderInventoryPage = async (req, res) => {
    try {
        res.render('admin/inventory');
    } catch (error) {
        console.error('Render inventory page error:', error);
        res.status(500).send('Server Error');
    }
};

export const getInventory = async (req, res) => {
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

export const updateStock = async (req, res) => {
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

export const downloadInvoice = async (req, res) => {
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
          ${order.items.filter(item => item.status !== 'Cancelled' && item.status !== 'Returned').map(item => `
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
          
          ${order.items.filter(item => item.status === 'Cancelled').length > 0 ? `
            <tr style="background-color: #ffe6e6;">
              <td colspan="4" style="font-weight: bold; color: #d32f2f;">CANCELLED ITEMS</td>
            </tr>
            ${order.items.filter(item => item.status === 'Cancelled').map(item => `
              <tr style="background-color: #ffe6e6; color: #666;">
                <td>
                  ${item.variantId?.productId?.productName || item.productName || 'Product'} [CANCELLED]<br>
                  <small>Color: ${item.variantId?.color || item.color || 'N/A'}</small>
                </td>
                <td>${item.quantity}</td>
                <td>₹${item.price.toLocaleString()}</td>
                <td>-₹${(item.quantity * item.price).toLocaleString()}</td>
              </tr>
            `).join('')}
          ` : ''}
          
          ${order.items.filter(item => item.status === 'Returned').length > 0 ? `
            <tr style="background-color: #fff3e0;">
              <td colspan="4" style="font-weight: bold; color: #f57c00;">RETURNED ITEMS</td>
            </tr>
            ${order.items.filter(item => item.status === 'Returned').map(item => `
              <tr style="background-color: #fff3e0; color: #666;">
                <td>
                  ${item.variantId?.productId?.productName || item.productName || 'Product'} [RETURNED]<br>
                  <small>Color: ${item.variantId?.color || item.color || 'N/A'}</small>
                </td>
                <td>${item.quantity}</td>
                <td>₹${item.price.toLocaleString()}</td>
                <td>-₹${(item.quantity * item.price).toLocaleString()}</td>
              </tr>
            `).join('')}
          ` : ''}
        </tbody>
      </table>
      
      <div class="total-section">
        <div class="total-row">Subtotal: ₹${(order.totalAmount - (order.deliveryCharge || 0)).toLocaleString()}</div>
        <div class="total-row">Delivery Charge: ₹${(order.deliveryCharge || 0).toLocaleString()}</div>
        <div class="total-row grand-total">Grand Total: ₹${order.totalAmount.toLocaleString()}</div>
      </div>
      
      ${order.returnRequests && order.returnRequests.length > 0 ? `
      <div style="margin-top: 30px;">
        <h3>Return Information:</h3>
        ${order.returnRequests.map(returnReq => `
          <div style="margin: 10px 0; padding: 10px; background-color: #f5f5f5; border-left: 4px solid #ff9800;">
            <strong>Return Status:</strong> ${returnReq.status}<br>
            <strong>Reason:</strong> ${returnReq.reason}<br>
            <strong>Requested:</strong> ${new Date(returnReq.requestedAt).toLocaleDateString()}<br>
            ${returnReq.processedAt ? `<strong>Processed:</strong> ${new Date(returnReq.processedAt).toLocaleDateString()}<br>` : ''}
            ${returnReq.refundAmount ? `<strong>Refund Amount:</strong> ₹${returnReq.refundAmount.toLocaleString()}<br>` : ''}
          </div>
        `).join('')}
      </div>
      ` : ''}
      
      ${order.refundStatus && order.refundStatus !== 'none' ? `
      <div style="margin-top: 20px;">
        <h3>Refund Information:</h3>
        <div style="padding: 10px; background-color: #e8f5e8; border-left: 4px solid #4caf50;">
          <strong>Refund Status:</strong> ${order.refundStatus}<br>
          ${order.refundAmount ? `<strong>Refund Amount:</strong> ₹${order.refundAmount.toLocaleString()}<br>` : ''}
          ${order.refundProcessedAt ? `<strong>Refund Processed:</strong> ${new Date(order.refundProcessedAt).toLocaleDateString()}<br>` : ''}
        </div>
      </div>
      ` : ''}
      
      <div class="footer">
        <p>Thank you for shopping with Melodia!</p>
        <p>For any queries regarding orders, returns, or refunds, contact us at support@melodia.com</p>
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

// ============ RETURN REQUEST PROCESSING ============
export const processReturnRequest = async (req, res) => {
    try {
        const { itemId } = req.params;
        const { action, reason } = req.body; // 'approve' or 'reject'

        const order = await Order.findOne({ 'items._id': itemId });
        if (!order) {
            return res.json({ success: false, message: 'Order not found' });
        }

        const item = order.items.id(itemId);
        if (!item) {
            return res.json({ success: false, message: 'Item not found' });
        }

        if (action === 'approve') {
            item.status = 'Returned';
            item.returnedAt = new Date();
            item.returnReason = reason || 'Return approved by admin';

            // Process refund using wallet service
            const walletService = (await import('../../services/walletService.js')).default;
            
            const refundResult = await walletService.addMoney(
                order.userId,
                item.totalPrice,
                `Refund for returned item - Order ${order.orderId}`,
                order._id
            );

            if (!refundResult.success) {
                console.error('Return refund failed:', refundResult.error);
            } else {
                console.log('Return refund processed successfully:', refundResult);
            }
        } else {
            item.returnReason = reason || 'Return rejected by admin';
        }

        await order.save();
        res.json({
            success: true,
            message: `Return request ${action}d successfully`
        });
    } catch (error) {
        res.json({ success: false, message: error.message });
    }
};

// ============ RETURN REQUEST APPROVAL/REJECTION ============
// Approve return request - automatically credits funds to user wallet
export const approveReturnRequest = async (req, res) => {
    try {
        const { itemId } = req.params;
        const { reason } = req.body;

        console.log('=== APPROVE RETURN REQUEST DEBUG ===');
        console.log('Item ID:', itemId);
        console.log('Reason:', reason);
        console.log('Request body:', req.body);
        console.log('Request params:', req.params);

        // Find the order containing this item
        const order = await Order.findOne({ 'items._id': itemId }).populate('userId', 'name email');
        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }

        // Find the specific item in the order
        const item = order.items.id(itemId);
        if (!item) {
            return res.status(404).json({
                success: false,
                message: 'Item not found in order'
            });
        }

        console.log('Current item status:', item.status);

        // Check if item is delivered (can be returned) or already cancelled
        if (item.status !== 'Delivered' && item.status !== 'Cancelled') {
            return res.status(400).json({
                success: false,
                message: `Item cannot be returned. Current status: ${item.status}`
            });
        }

        // Update item status
        item.status = 'Returned';
        item.returnedAt = new Date();
        item.returnReason = reason || 'Return approved by admin';

        // Calculate refund amount (item's total price)
        const refundAmount = item.totalPrice;

        // Process refund using wallet service
        const walletService = (await import('../../services/walletService.js')).default;
        
        const refundResult = await walletService.addMoney(
            order.userId._id,
            refundAmount,
            `Refund for returned item - Order ${order.orderId}`,
            order._id
        );

        if (!refundResult.success) {
            throw new Error(refundResult.error || 'Refund processing failed');
        }

        console.log('Return refund processed successfully:', refundResult);

        // Update any pending return request for this item
        if (order.returnRequests && order.returnRequests.length > 0) {
            const returnRequest = order.returnRequests.find(req =>
                req.itemId && req.itemId.toString() === itemId
            );
            if (returnRequest) {
                returnRequest.status = 'approved';
                returnRequest.processedAt = new Date();
                returnRequest.adminReason = reason || 'Return approved by admin';
            }
        }

        // Save the order
        await order.save();

        console.log('Return approved successfully:', {
            orderId: order.orderId,
            itemId,
            refundAmount,
            userBalance: user?.wallet?.balance
        });

        res.json({
            success: true,
            message: 'Return request approved successfully',
            data: {
                refundAmount,
                newWalletBalance: refundResult.newBalance
            }
        });

    } catch (error) {
        console.error('Error approving return:', error);
        console.error('Error details:', error.message);
        console.error('Stack trace:', error.stack);
        res.status(500).json({
            success: false,
            message: `Failed to approve return request: ${error.message}`
        });
    }
};

// Reject return request
export const rejectReturnRequest = async (req, res) => {
    try {
        const { itemId } = req.params;
        const { reason } = req.body;

        console.log('=== REJECT RETURN REQUEST DEBUG ===');
        console.log('Item ID:', itemId);
        console.log('Reason:', reason);
        console.log('Request body:', req.body);
        console.log('Request params:', req.params);

        // Find the order containing this item
        const order = await Order.findOne({ 'items._id': itemId });
        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }

        // Find the specific item in the order
        const item = order.items.id(itemId);
        if (!item) {
            return res.status(404).json({
                success: false,
                message: 'Item not found in order'
            });
        }

        console.log('Current item status:', item.status);

        // Check if item is in a state that can be rejected
        if (item.status !== 'Delivered' && item.status !== 'Cancelled' && item.status !== 'Returned') {
            return res.status(400).json({
                success: false,
                message: `Item cannot be processed for return rejection. Current status: ${item.status}`
            });
        }

        // Keep item status as delivered (don't change if already delivered)
        if (item.status === 'Returned') {
            item.status = 'Delivered'; // Revert back to delivered
        }
        item.returnReason = reason || 'Return rejected by admin';

        // Update any pending return request for this item
        if (order.returnRequests && order.returnRequests.length > 0) {
            const returnRequest = order.returnRequests.find(req =>
                req.itemId && req.itemId.toString() === itemId
            );
            if (returnRequest) {
                returnRequest.status = 'rejected';
                returnRequest.processedAt = new Date();
                returnRequest.adminReason = reason || 'Return rejected by admin';
            }
        }

        // Save the order
        await order.save();

        console.log('Return rejected successfully:', {
            orderId: order.orderId,
            itemId,
            reason
        });

        res.json({
            success: true,
            message: 'Return request rejected successfully'
        });

    } catch (error) {
        console.error('Error rejecting return:', error);
        console.error('Error details:', error.message);
        console.error('Stack trace:', error.stack);
        res.status(500).json({
            success: false,
            message: `Failed to reject return request: ${error.message}`
        });
    }
};

// Legacy function for existing frontend compatibility
export const processReturnRequestLegacy = async (req, res) => {
    try {
        const { returnRequestId } = req.params;
        const { action, rejectionReason } = req.body;

        console.log('=== LEGACY RETURN REQUEST PROCESSING ===');
        console.log('Return Request ID:', returnRequestId);
        console.log('Action:', action);
        console.log('Rejection Reason:', rejectionReason);

        // Find the order containing this return request
        const order = await Order.findOne({
            'returnRequests._id': returnRequestId
        }).populate('userId', 'name email');

        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Return request not found'
            });
        }

        // Find the specific return request
        const returnRequest = order.returnRequests.id(returnRequestId);
        if (!returnRequest) {
            return res.status(404).json({
                success: false,
                message: 'Return request not found'
            });
        }

        // Find the item associated with this return request
        const item = order.items.id(returnRequest.itemId);
        if (!item) {
            return res.status(404).json({
                success: false,
                message: 'Item not found for this return request'
            });
        }

        console.log('Found item:', item._id, 'with status:', item.status);

        if (action === 'approved') {
            // Update return request
            returnRequest.status = 'approved';
            returnRequest.processedAt = new Date();
            returnRequest.adminReason = 'Return approved by admin';

            // Update item status
            item.status = 'Returned';
            item.returnedAt = new Date();
            item.returnReason = 'Return approved by admin';

            // Calculate refund amount
            const refundAmount = item.totalPrice;

            // Process refund using wallet service
            const walletService = (await import('../../services/walletService.js')).default;
            
            const refundResult = await walletService.addMoney(
                order.userId._id,
                refundAmount,
                `Refund for returned item - Order ${order.orderId}`,
                order._id
            );

            if (!refundResult.success) {
                throw new Error(refundResult.error || 'Refund processing failed');
            }

            console.log('Legacy return refund processed successfully:', refundResult);

            await order.save();

            console.log('Return approved successfully');

            res.json({
                success: true,
                message: 'Return request approved successfully',
                data: {
                    refundAmount,
                    newWalletBalance: refundResult.newBalance
                }
            });

        } else if (action === 'rejected') {
            // Update return request
            returnRequest.status = 'rejected';
            returnRequest.processedAt = new Date();
            returnRequest.adminReason = rejectionReason || 'Return rejected by admin';

            // Keep item status as delivered (don't change)
            item.returnReason = rejectionReason || 'Return rejected by admin';

            await order.save();

            console.log('Return rejected successfully');

            res.json({
                success: true,
                message: 'Return request rejected successfully'
            });

        } else {
            return res.status(400).json({
                success: false,
                message: 'Invalid action. Must be "approved" or "rejected"'
            });
        }

    } catch (error) {
        console.error('Error processing legacy return request:', error);
        console.error('Error details:', error.message);
        console.error('Stack trace:', error.stack);
        res.status(500).json({
            success: false,
            message: `Failed to process return request: ${error.message}`
        });
    }
};

// ============ ORDER CANCELLATION METHODS ============

// Cancel entire order (Admin)
export const adminCancelOrder = async (req, res) => {
    try {
        const { orderId } = req.params;
        const { reason } = req.body;

        console.log('=== ADMIN CANCEL ORDER ===');
        console.log('Order ID:', orderId);
        console.log('Reason:', reason);

        const order = await Order.findById(orderId).populate('userId', 'name email');
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
                item.variantId,
                { $inc: { stock: item.quantity } }
            );
        }

        // Cancel the order
        order.orderStatus = 'Cancelled';
        order.cancellationReason = reason;
        order.cancelledAt = new Date();

        // Update all items to cancelled
        order.items.forEach(item => {
            item.status = 'Cancelled';
            item.cancelledAt = new Date();
            item.cancellationReason = reason;
        });

        await order.save();

        // Process refund if payment was made (NOT COD)
        let refundResult = null;
        console.log('Admin cancellation - checking refund eligibility:', {
            orderId: order.orderId,
            paymentMethod: order.paymentMethod,
            paymentStatus: order.paymentStatus,
            totalAmount: order.totalAmount,
            walletAmountUsed: order.walletAmountUsed
        });

        if (order.paymentStatus === 'Paid' && order.paymentMethod !== 'COD') {
            try {
                // Import walletService
                const walletService = (await import('../../services/walletService.js')).default;
                
                refundResult = await walletService.addMoney(
                    order.userId._id,
                    order.totalAmount,
                    `Refund for admin cancelled order ${order.orderId}`,
                    order._id
                );

                if (refundResult.success) {
                    // Update order refund status
                    order.refundStatus = 'processed';
                    order.refundAmount = order.totalAmount;
                    order.refundProcessedAt = new Date();
                    await order.save();
                    
                    console.log('Admin refund processed successfully:', refundResult);
                } else {
                    throw new Error(refundResult.error || 'Refund processing failed');
                }
            } catch (refundError) {
                console.error('Admin refund processing error:', refundError);
                // Order is still cancelled, but refund failed
                return res.json({
                    success: true,
                    message: 'Order cancelled successfully, but refund processing failed. Please process refund manually.',
                    refundError: refundError.message
                });
            }
        } else {
            console.log('Admin cancellation - no refund needed (COD or unpaid order)');
        }

        res.json({
            success: true,
            message: 'Order cancelled successfully',
            refund: refundResult
        });

    } catch (error) {
        console.error('Admin cancel order error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to cancel order'
        });
    }
};

// Cancel specific items (Admin)
export const adminCancelOrderItems = async (req, res) => {
    try {
        const { orderId } = req.params;
        const { items, reason } = req.body;

        console.log('=== ADMIN CANCEL ORDER ITEMS ===');
        console.log('Order ID:', orderId);
        console.log('Items to cancel:', items);
        console.log('Reason:', reason);

        if (!items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No items specified for cancellation'
            });
        }

        const order = await Order.findById(orderId).populate('userId', 'name email');
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

        // Store original total for refund calculation
        const originalTotal = order.totalAmount;

        // Restore stock for cancelled items
        for (const item of items) {
            await Variant.findByIdAndUpdate(
                item.variantId,
                { $inc: { stock: item.quantity } }
            );
        }

        // Cancel the items using the order schema method
        console.log('Calling order.cancelItems with:', { items, reason });
        await order.cancelItems(items, reason);
        console.log('Items cancelled successfully in order');

        // Get updated order to see new totals
        const updatedOrder = await Order.findById(orderId);
        const refundAmount = originalTotal - updatedOrder.totalAmount;

        console.log('Refund calculation:', {
            originalTotal,
            newTotal: updatedOrder.totalAmount,
            refundAmount
        });

        // Process partial refund if payment was made (NOT COD)
        let refundResult = null;
        if (order.paymentStatus === 'Paid' && order.paymentMethod !== 'COD' && refundAmount > 0) {
            try {
                // Import walletService
                const walletService = (await import('../../services/walletService.js')).default;
                
                refundResult = await walletService.addMoney(
                    order.userId._id,
                    refundAmount,
                    `Partial refund for admin cancelled items - Order ${order.orderId}`,
                    order._id
                );

                if (refundResult.success) {
                    console.log('Partial refund processed successfully:', refundResult);
                } else {
                    throw new Error(refundResult.error || 'Refund processing failed');
                }
            } catch (refundError) {
                console.error('Partial refund processing error:', refundError);
                return res.json({
                    success: true,
                    message: 'Items cancelled successfully, but refund processing failed. Please process refund manually.',
                    refundError: refundError.message,
                    orderUpdate: {
                        originalTotal,
                        newTotal: updatedOrder.totalAmount,
                        refundAmount
                    }
                });
            }
        }

        res.json({
            success: true,
            message: 'Items cancelled successfully',
            orderUpdate: {
                originalTotal,
                newTotal: updatedOrder.totalAmount,
                refundAmount
            },
            refund: refundResult
        });

    } catch (error) {
        console.error('Admin cancel order items error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to cancel items'
        });
    }
};

// Process manual refund (Admin)
export const processManualRefund = async (req, res) => {
    try {
        const { orderId } = req.params;
        const { amount, reason } = req.body;

        console.log('=== PROCESS MANUAL REFUND ===');
        console.log('Order ID:', orderId);
        console.log('Amount:', amount);
        console.log('Reason:', reason);

        if (!amount || amount <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Invalid refund amount'
            });
        }

        const order = await Order.findById(orderId).populate('userId', 'name email');
        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }

        // Import walletService
        const walletService = (await import('../../services/walletService.js')).default;
        
        const refundResult = await walletService.addMoney(
            order.userId._id,
            amount,
            reason || `Manual refund - Order ${order.orderId}`,
            order._id,
            req.session.admin?.id // Admin ID if available
        );

        if (refundResult.success) {
            // Update order refund status
            await Order.findByIdAndUpdate(orderId, {
                refundStatus: 'processed',
                refundAmount: (order.refundAmount || 0) + amount,
                refundProcessedAt: new Date()
            });

            res.json({
                success: true,
                message: 'Manual refund processed successfully',
                refund: {
                    amount: amount,
                    newWalletBalance: refundResult.newBalance,
                    transactionId: refundResult.transactionId
                }
            });
        } else {
            res.status(500).json({
                success: false,
                message: 'Failed to process refund: ' + refundResult.error
            });
        }

    } catch (error) {
        console.error('Process manual refund error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to process manual refund'
        });
    }
};

// Default export for compatibility
export default {
    listOrder,
    renderOrdersPage,
    getAdminOrderDetails,
    updateOrderStatus,
    updateItemStatus,
    renderInventoryPage,
    getInventory,
    updateStock,
    downloadInvoice,
    processReturnRequest,
    approveReturnRequest,
    rejectReturnRequest,
    processReturnRequestLegacy,
    adminCancelOrder,
    adminCancelOrderItems,
    processManualRefund
};