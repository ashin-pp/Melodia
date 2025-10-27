import walletService from '../../services/walletService.js';
import User from '../../model/userSchema.js';
import Order from '../../model/orderSchema.js';

// Get all return requests
export const getReturnRequests = async (req, res) => {
    try {
        const { page = 1, limit = 20, status = 'all', search = '' } = req.query;
        const skip = (page - 1) * limit;

        let matchCondition = {};
        
        // Filter by status
        if (status !== 'all') {
            matchCondition['returnRequests.status'] = status;
        }

        // Search functionality
        let searchCondition = {};
        if (search) {
            searchCondition = {
                $or: [
                    { orderId: { $regex: search, $options: 'i' } },
                    { 'returnRequests.reason': { $regex: search, $options: 'i' } }
                ]
            };
        }

        const aggregationPipeline = [
            { $match: { returnRequests: { $exists: true, $ne: [] } } },
            { $unwind: '$returnRequests' },
            { $match: { ...matchCondition, ...searchCondition } },
            {
                $lookup: {
                    from: 'users',
                    localField: 'userId',
                    foreignField: '_id',
                    as: 'user'
                }
            },
            { $unwind: '$user' },
            {
                $project: {
                    orderId: 1,
                    orderDate: 1,
                    totalAmount: 1,
                    'user.name': 1,
                    'user.email': 1,
                    returnRequest: '$returnRequests',
                    createdAt: '$returnRequests.requestedAt'
                }
            },
            { $sort: { createdAt: -1 } },
            { $skip: skip },
            { $limit: parseInt(limit) }
        ];

        const returnRequests = await Order.aggregate(aggregationPipeline);

        // Get total count for pagination
        const countPipeline = [
            { $match: { returnRequests: { $exists: true, $ne: [] } } },
            { $unwind: '$returnRequests' },
            { $match: { ...matchCondition, ...searchCondition } },
            { $count: 'total' }
        ];

        const countResult = await Order.aggregate(countPipeline);
        const totalRequests = countResult[0]?.total || 0;

        res.json({
            success: true,
            returnRequests: returnRequests,
            pagination: {
                currentPage: parseInt(page),
                totalPages: Math.ceil(totalRequests / limit),
                totalRequests: totalRequests,
                limit: parseInt(limit)
            }
        });

    } catch (error) {
        console.error('Error getting return requests:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get return requests'
        });
    }
};

// Get return requests page
export const getReturnRequestsPage = async (req, res) => {
    try {
        res.render('admin/return-requests', {
            title: 'Return Requests - Admin'
        });
    } catch (error) {
        console.error('Error loading return requests page:', error);
        res.status(500).render('error/500');
    }
};

// Approve return request
export const approveReturn = async (req, res) => {
    try {
        const { orderId, itemId } = req.params;
        const { adminNotes } = req.body;
        const adminId = req.session.admin.id;

        const order = await Order.findById(orderId);
        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }

        // Find the return request
        const returnRequestIndex = order.returnRequests.findIndex(
            req => req.itemId.toString() === itemId && req.status === 'pending'
        );

        if (returnRequestIndex === -1) {
            return res.status(404).json({
                success: false,
                message: 'Pending return request not found'
            });
        }

        const returnRequest = order.returnRequests[returnRequestIndex];

        // Update return request status
        order.returnRequests[returnRequestIndex].status = 'approved';
        order.returnRequests[returnRequestIndex].processedAt = new Date();
        order.returnRequests[returnRequestIndex].processedBy = adminId;
        order.returnRequests[returnRequestIndex].adminNotes = adminNotes || '';

        // IMPORTANT: Update the actual item status to 'Returned'
        const orderItem = order.items.id(itemId);
        if (orderItem) {
            orderItem.status = 'Returned';
            orderItem.returnedAt = new Date();
            
            // Add to status history if it exists
            if (!orderItem.statusHistory) {
                orderItem.statusHistory = [];
            }
            orderItem.statusHistory.push({
                status: 'Returned',
                updatedAt: new Date(),
                reason: 'Return request approved by admin'
            });
        }

        await order.save();

        // Process wallet refund
        try {
            const refundResult = await walletService.processReturnRefund(
                orderId, 
                itemId, 
                order.userId, 
                adminId
            );

            res.json({
                success: true,
                message: 'Return request approved and refund processed successfully',
                refund: {
                    amount: refundResult.refundAmount,
                    transactionId: refundResult.transactionId,
                    newWalletBalance: refundResult.newBalance
                }
            });

        } catch (refundError) {
            console.error('Refund processing error:', refundError);
            res.json({
                success: true,
                message: 'Return request approved, but refund processing failed. Please process manually.',
                refundError: refundError.message
            });
        }

    } catch (error) {
        console.error('Error approving return:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to approve return request'
        });
    }
};

// Reject return request
export const rejectReturn = async (req, res) => {
    try {
        const { orderId, itemId } = req.params;
        const { reason, adminNotes } = req.body;
        const adminId = req.session.admin.id;

        if (!reason) {
            return res.status(400).json({
                success: false,
                message: 'Rejection reason is required'
            });
        }

        const order = await Order.findById(orderId);
        if (!order) {
            return res.status(404).json({
                success: false,
                message: 'Order not found'
            });
        }

        // Find the return request
        const returnRequestIndex = order.returnRequests.findIndex(
            req => req.itemId.toString() === itemId && req.status === 'pending'
        );

        if (returnRequestIndex === -1) {
            return res.status(404).json({
                success: false,
                message: 'Pending return request not found'
            });
        }

        // Update return request status
        order.returnRequests[returnRequestIndex].status = 'rejected';
        order.returnRequests[returnRequestIndex].processedAt = new Date();
        order.returnRequests[returnRequestIndex].processedBy = adminId;
        order.returnRequests[returnRequestIndex].adminNotes = `Rejected: ${reason}. ${adminNotes || ''}`;

        await order.save();

        res.json({
            success: true,
            message: 'Return request rejected successfully'
        });

    } catch (error) {
        console.error('Error rejecting return:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to reject return request'
        });
    }
};

// Get user wallets
export const getUserWallets = async (req, res) => {
    try {
        const { page = 1, limit = 20, search = '', sortBy = 'balance', order = 'desc' } = req.query;
        const skip = (page - 1) * limit;

        let query = {};
        if (search) {
            query = {
                $or: [
                    { name: { $regex: search, $options: 'i' } },
                    { email: { $regex: search, $options: 'i' } }
                ]
            };
        }

        const sortOrder = order === 'desc' ? -1 : 1;
        const sortField = sortBy === 'balance' ? 'wallet.balance' : sortBy;

        const users = await User.find(query)
            .select('name email wallet createdOn')
            .sort({ [sortField]: sortOrder })
            .skip(skip)
            .limit(parseInt(limit));

        const totalUsers = await User.countDocuments(query);

        res.json({
            success: true,
            users: users,
            pagination: {
                currentPage: parseInt(page),
                totalPages: Math.ceil(totalUsers / limit),
                totalUsers: totalUsers,
                limit: parseInt(limit)
            }
        });

    } catch (error) {
        console.error('Error getting user wallets:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get user wallets'
        });
    }
};

// Get wallet management page
export const getWalletManagementPage = async (req, res) => {
    try {
        const stats = await walletService.getWalletStats();
        
        res.render('admin/wallet-management', {
            title: 'Wallet Management - Admin',
            stats: stats
        });
    } catch (error) {
        console.error('Error loading wallet management page:', error);
        res.status(500).render('error/500');
    }
};

// Adjust wallet balance
export const adjustWalletBalance = async (req, res) => {
    try {
        const { userId } = req.params;
        const { amount, reason } = req.body;
        const adminId = req.session.admin.id;

        if (!amount || amount === 0) {
            return res.status(400).json({
                success: false,
                message: 'Valid adjustment amount is required'
            });
        }

        if (!reason) {
            return res.status(400).json({
                success: false,
                message: 'Adjustment reason is required'
            });
        }

        const result = await walletService.adjustWalletBalance(
            userId, 
            parseFloat(amount), 
            reason, 
            adminId
        );

        res.json({
            success: true,
            message: 'Wallet balance adjusted successfully',
            adjustment: {
                amount: parseFloat(amount),
                newBalance: result.newBalance,
                transactionId: result.transactionId
            }
        });

    } catch (error) {
        console.error('Error adjusting wallet balance:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Failed to adjust wallet balance'
        });
    }
};

// Get wallet reports
export const getWalletReports = async (req, res) => {
    try {
        const { startDate, endDate, type = 'all' } = req.query;

        let dateFilter = {};
        if (startDate && endDate) {
            dateFilter = {
                'wallet.transactions.createdAt': {
                    $gte: new Date(startDate),
                    $lte: new Date(endDate)
                }
            };
        }

        // Get wallet statistics
        const stats = await walletService.getWalletStats();

        // Get transaction summary
        const transactionSummary = await User.aggregate([
            { $match: dateFilter },
            { $unwind: '$wallet.transactions' },
            {
                $group: {
                    _id: '$wallet.transactions.type',
                    totalAmount: { $sum: '$wallet.transactions.amount' },
                    count: { $sum: 1 }
                }
            }
        ]);

        // Get top users by wallet balance
        const topUsers = await User.find({})
            .select('name email wallet.balance')
            .sort({ 'wallet.balance': -1 })
            .limit(10);

        res.json({
            success: true,
            stats: stats,
            transactionSummary: transactionSummary,
            topUsers: topUsers
        });

    } catch (error) {
        console.error('Error getting wallet reports:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get wallet reports'
        });
    }
};

// Process return request (approve/reject)
export const processReturnRequest = async (req, res) => {
    try {
        const { returnRequestId } = req.params;
        const { action, rejectionReason } = req.body; // 'approved' or 'rejected'

        console.log('Processing return request:', { returnRequestId, action, rejectionReason });

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
        const returnRequest = order.returnRequests.find(
            req => req._id.toString() === returnRequestId
        );

        if (!returnRequest) {
            return res.status(404).json({
                success: false,
                message: 'Return request not found'
            });
        }

        if (returnRequest.status !== 'pending') {
            return res.status(400).json({
                success: false,
                message: 'Return request has already been processed'
            });
        }

        // Update return request status
        returnRequest.status = action;
        returnRequest.processedAt = new Date();

        // Add rejection reason if provided
        if (action === 'rejected' && rejectionReason) {
            returnRequest.adminNotes = rejectionReason;
        }

        if (action === 'approved') {
            // IMPORTANT: Update the actual item status to 'Returned'
            const orderItem = order.items.id(returnRequest.itemId);
            if (orderItem) {
                orderItem.status = 'Returned';
                orderItem.returnedAt = new Date();
                
                // Add to status history if it exists
                if (!orderItem.statusHistory) {
                    orderItem.statusHistory = [];
                }
                orderItem.statusHistory.push({
                    status: 'Returned',
                    updatedAt: new Date(),
                    reason: 'Return request approved by admin'
                });
            }

            // Process refund to user's wallet
            try {
                const refundResult = await walletService.addMoney(
                    order.userId._id,
                    returnRequest.refundAmount,
                    `Refund for return request - Order ${order.orderId}`,
                    order._id
                );

                console.log('Refund processed:', refundResult);
            } catch (refundError) {
                console.error('Refund processing error:', refundError);
                return res.status(500).json({
                    success: false,
                    message: 'Failed to process refund'
                });
            }
        }

        await order.save();

        res.json({
            success: true,
            message: `Return request ${action} successfully`,
            returnRequest: {
                id: returnRequest._id,
                status: returnRequest.status,
                processedAt: returnRequest.processedAt,
                adminNotes: returnRequest.adminNotes
            }
        });

    } catch (error) {
        console.error('Process return request error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to process return request'
        });
    }
};

export default {
    getReturnRequests,
    getReturnRequestsPage,
    approveReturn,
    rejectReturn,
    processReturnRequest,
    getUserWallets,
    getWalletManagementPage,
    adjustWalletBalance,
    getWalletReports
};