import User from '../model/userSchema.js';
import Order from '../model/orderSchema.js';

export const walletService = {
    // Generate unique transaction ID
    generateTransactionId: () => {
        const timestamp = Date.now().toString();
        const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
        return `TXN${timestamp}${random}`;
    },

    // Get wallet balance for a user
    getBalance: async (userId) => {
        try {
            const user = await User.findById(userId).select('wallet.balance');
            if (!user) {
                throw new Error('User not found');
            }
            return user.wallet.balance || 0;
        } catch (error) {
            console.error('Error getting wallet balance:', error);
            throw error;
        }
    },

    // Add money to wallet (credit) - No transactions for standalone MongoDB
    addMoney: async (userId, amount, description, orderId = null, adminId = null) => {
        try {
            console.log('=== WALLET SERVICE ADD MONEY START ===');
            console.log('Input parameters:', {
                userId: userId,
                userIdType: typeof userId,
                amount: amount,
                amountType: typeof amount,
                description: description,
                orderId: orderId,
                adminId: adminId
            });

            // Validate inputs
            if (!userId) {
                throw new Error('User ID is required');
            }

            if (!amount || amount <= 0) {
                throw new Error('Amount must be greater than 0');
            }

            if (typeof amount !== 'number') {
                throw new Error('Amount must be a number');
            }

            console.log('✅ Input validation passed');

            // Find user with detailed logging
            console.log('🔍 Searching for user with ID:', userId);
            const user = await User.findById(userId);
            
            if (!user) {
                console.error('❌ User not found with ID:', userId);
                throw new Error(`User not found with ID: ${userId}`);
            }

            console.log('✅ User found:', {
                id: user._id,
                name: user.name,
                email: user.email,
                hasWallet: !!user.wallet,
                walletBalance: user.wallet ? user.wallet.balance : 'No wallet'
            });

            // Initialize wallet if it doesn't exist
            if (!user.wallet) {
                console.log('🔧 Initializing wallet for user');
                user.wallet = {
                    balance: 0,
                    transactions: [],
                    isWalletActive: true
                };
                console.log('💾 Saving user with new wallet...');
                await user.save();
                console.log('✅ Wallet initialized successfully');
            }

            if (!user.wallet.isWalletActive) {
                throw new Error('Wallet is deactivated');
            }

            const currentBalance = user.wallet.balance || 0;
            const newBalance = currentBalance + amount;
            const transactionId = walletService.generateTransactionId();

            console.log('💰 Balance calculation:', {
                currentBalance: currentBalance,
                addAmount: amount,
                newBalance: newBalance,
                transactionId: transactionId
            });

            // Create transaction record
            const transaction = {
                type: 'credit',
                amount: amount,
                description: description,
                orderId: orderId,
                transactionId: transactionId,
                balanceAfter: newBalance,
                createdAt: new Date(),
                adminId: adminId
            };

            console.log('📝 Creating transaction record:', transaction);

            // Update user wallet - use direct save method for better reliability
            console.log('💾 Updating wallet balance and adding transaction...');
            user.wallet.balance = newBalance;
            user.wallet.transactions.push(transaction);
            
            console.log('💾 Saving user with updated wallet...');
            const savedUser = await user.save();

            console.log('✅ WALLET UPDATE SUCCESSFUL:', {
                userId: savedUser._id,
                oldBalance: currentBalance,
                newBalance: savedUser.wallet.balance,
                transactionId: transactionId,
                transactionCount: savedUser.wallet.transactions.length,
                latestTransaction: savedUser.wallet.transactions[savedUser.wallet.transactions.length - 1]
            });

            return {
                success: true,
                transactionId: transactionId,
                newBalance: savedUser.wallet.balance,
                transaction: transaction
            };

        } catch (error) {
            console.error('❌ WALLET SERVICE ERROR:', {
                errorName: error.name,
                errorMessage: error.message,
                errorStack: error.stack,
                userId: userId,
                amount: amount
            });
            
            return {
                success: false,
                error: error.message,
                transactionId: null,
                newBalance: null
            };
        }
    },

    // Deduct money from wallet (debit) - No transactions for standalone MongoDB
    deductMoney: async (userId, amount, description, orderId = null) => {
        try {
            if (amount <= 0) {
                throw new Error('Amount must be greater than 0');
            }

            const user = await User.findById(userId);
            if (!user) {
                throw new Error('User not found');
            }

            if (!user.wallet.isWalletActive) {
                throw new Error('Wallet is deactivated');
            }

            const currentBalance = user.wallet.balance || 0;
            if (currentBalance < amount) {
                throw new Error('Insufficient wallet balance');
            }

            const newBalance = currentBalance - amount;
            const transactionId = walletService.generateTransactionId();

            // Create transaction record
            const transaction = {
                type: 'debit',
                amount: amount,
                description: description,
                orderId: orderId,
                transactionId: transactionId,
                balanceAfter: newBalance,
                createdAt: new Date()
            };

            // Update user wallet without MongoDB transactions
            await User.findByIdAndUpdate(
                userId,
                {
                    $set: { 'wallet.balance': newBalance },
                    $push: { 'wallet.transactions': transaction }
                },
                { new: true }
            );


            return {
                success: true,
                transactionId: transactionId,
                newBalance: newBalance,
                transaction: transaction
            };

        } catch (error) {
            return {
                success: false,
                error: error.message,
                transactionId: null,
                newBalance: null
            };
        }
    },

    // Get transaction history with filtering
    getTransactionHistory: async (userId, filters = {}) => {
        try {
            const { page = 1, limit = 20, type, startDate, endDate } = filters;
            const skip = (page - 1) * limit;

            const user = await User.findById(userId).select('wallet.transactions');
            if (!user) {
                throw new Error('User not found');
            }

            let transactions = user.wallet.transactions || [];

            // Apply filters
            if (type) {
                transactions = transactions.filter(t => t.type === type);
            }

            if (startDate || endDate) {
                transactions = transactions.filter(t => {
                    const transactionDate = new Date(t.createdAt);
                    if (startDate && transactionDate < new Date(startDate)) return false;
                    if (endDate && transactionDate > new Date(endDate)) return false;
                    return true;
                });
            }

            // Sort by date (newest first)
            transactions.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

            // Apply pagination
            const totalTransactions = transactions.length;
            const paginatedTransactions = transactions.slice(skip, skip + limit);

            return {
                transactions: paginatedTransactions,
                pagination: {
                    currentPage: page,
                    totalPages: Math.ceil(totalTransactions / limit),
                    totalTransactions: totalTransactions,
                    limit: limit
                }
            };

        } catch (error) {
            console.error('Error getting transaction history:', error);
            throw error;
        }
    },

    // Validate wallet payment
    validateWalletPayment: async (userId, amount) => {
        try {
            if (amount <= 0) {
                return { valid: false, message: 'Invalid amount' };
            }

            const user = await User.findById(userId).select('wallet.balance wallet.isWalletActive');
            if (!user) {
                return { valid: false, message: 'User not found' };
            }

            if (!user.wallet.isWalletActive) {
                return { valid: false, message: 'Wallet is deactivated' };
            }

            const balance = user.wallet.balance || 0;
            if (balance < amount) {
                return {
                    valid: false,
                    message: 'Insufficient wallet balance',
                    currentBalance: balance,
                    requiredAmount: amount
                };
            }

            return {
                valid: true,
                currentBalance: balance,
                message: 'Wallet payment validated successfully'
            };

        } catch (error) {
            console.error('Error validating wallet payment:', error);
            return { valid: false, message: 'Validation failed' };
        }
    },

    // Process wallet payment
    processWalletPayment: async (userId, amount, orderId) => {
        try {
            const validation = await walletService.validateWalletPayment(userId, amount);
            if (!validation.valid) {
                throw new Error(validation.message);
            }

            const result = await walletService.deductMoney(
                userId,
                amount,
                `Payment for order ${orderId}`,
                orderId
            );

            return result;

        } catch (error) {
            console.error('Error processing wallet payment:', error);
            throw error;
        }
    },

    // Process order cancellation refund
    processOrderCancellationRefund: async (orderId, userId) => {
        try {
            const order = await Order.findById(orderId);
            if (!order) {
                return { success: false, message: 'Order not found' };
            }

            if (order.userId.toString() !== userId.toString()) {
                return { success: false, message: 'Unauthorized access to order' };
            }

            // Only refund if payment was made (not COD) and payment was successful
            if (order.paymentMethod === 'COD') {
                return { success: false, message: 'No refund needed for COD orders' };
            }

            if (order.paymentStatus !== 'Paid') {
                return { success: false, message: 'No refund needed for unpaid orders' };
            }

            // Calculate refund amount based on payment method
            let refundAmount = 0;

            console.log('Order details for refund:', {
                paymentMethod: order.paymentMethod,
                paymentStatus: order.paymentStatus,
                totalAmount: order.totalAmount,
                walletAmountUsed: order.walletAmountUsed,
                orderId: order.orderId
            });

            if (order.paymentMethod === 'WALLET') {
                // For pure wallet payments, refund the total amount
                // The walletAmountUsed should equal totalAmount for pure wallet payments
                refundAmount = order.totalAmount;
                console.log('Wallet payment detected - refunding total amount:', refundAmount);
            } else if (order.paymentMethod === 'RAZORPAY') {
                // For Razorpay payments, refund the amount paid via Razorpay
                refundAmount = order.totalAmount;
                if (order.walletAmountUsed && order.walletAmountUsed > 0) {
                    // If wallet was also used in combination, only refund the Razorpay portion
                    refundAmount = order.totalAmount - order.walletAmountUsed;
                    console.log('Combined payment detected - refunding Razorpay portion:', refundAmount);
                }
            } else if (order.walletAmountUsed && order.walletAmountUsed > 0) {
                // If wallet was used with other payment methods (like COD + wallet)
                refundAmount = order.walletAmountUsed;
                console.log('Partial wallet payment detected - refunding wallet portion:', refundAmount);
            } else {
                // For other payment methods, refund the total amount
                refundAmount = order.totalAmount;
                console.log('Other payment method detected - refunding total amount:', refundAmount);
            }

            console.log('Final refund calculation:', {
                paymentMethod: order.paymentMethod,
                totalAmount: order.totalAmount,
                walletAmountUsed: order.walletAmountUsed,
                calculatedRefund: refundAmount
            });

            if (refundAmount <= 0) {
                return { success: false, message: 'No refund amount calculated' };
            }

            // Process refund to wallet
            const refundResult = await walletService.addMoney(
                userId,
                refundAmount,
                `Refund for cancelled order ${order.orderId}`,
                orderId
            );

            if (!refundResult.success) {
                return { success: false, message: refundResult.error };
            }

            // Update order refund status
            await Order.findByIdAndUpdate(orderId, {
                refundStatus: 'processed',
                refundAmount: refundAmount,
                refundProcessedAt: new Date()
            });

            return {
                success: true,
                refundAmount: refundAmount,
                transactionId: refundResult.transactionId,
                newBalance: refundResult.newBalance
            };

        } catch (error) {
            console.error('Error processing cancellation refund:', error);
            return { success: false, message: error.message };
        }
    },

    // Process return refund (admin approved)
    processReturnRefund: async (orderId, itemId, userId, adminId) => {
        try {
            const order = await Order.findById(orderId);
            if (!order) {
                throw new Error('Order not found');
            }

            // Find the return request
            const returnRequest = order.returnRequests.find(
                req => req.itemId.toString() === itemId.toString() && req.status === 'approved'
            );

            if (!returnRequest) {
                throw new Error('Approved return request not found');
            }

            const refundAmount = returnRequest.refundAmount;
            if (refundAmount <= 0) {
                throw new Error('Invalid refund amount');
            }

            // Process refund to wallet
            const refundResult = await walletService.addMoney(
                userId,
                refundAmount,
                `Refund for returned item - Order ${order.orderId}`,
                orderId,
                adminId
            );

            // Update return request status
            await Order.findOneAndUpdate(
                { _id: orderId, 'returnRequests.itemId': itemId },
                {
                    $set: {
                        'returnRequests.$.processedAt': new Date(),
                        'returnRequests.$.processedBy': adminId
                    }
                }
            );

            return {
                success: true,
                refundAmount: refundAmount,
                transactionId: refundResult.transactionId,
                newBalance: refundResult.newBalance
            };

        } catch (error) {
            console.error('Error processing return refund:', error);
            throw error;
        }
    },

    // Admin: Adjust wallet balance
    adjustWalletBalance: async (userId, amount, reason, adminId) => {
        try {
            if (amount === 0) {
                throw new Error('Adjustment amount cannot be zero');
            }

            const description = `Admin adjustment: ${reason}`;

            if (amount > 0) {
                return await walletService.addMoney(userId, amount, description, null, adminId);
            } else {
                return await walletService.deductMoney(userId, Math.abs(amount), description, null);
            }

        } catch (error) {
            console.error('Error adjusting wallet balance:', error);
            throw error;
        }
    },



    // Get wallet statistics for admin
    getWalletStats: async () => {
        try {
            const stats = await User.aggregate([
                {
                    $group: {
                        _id: null,
                        totalUsers: { $sum: 1 },
                        totalWalletBalance: { $sum: '$wallet.balance' },
                        activeWallets: {
                            $sum: {
                                $cond: [{ $eq: ['$wallet.isWalletActive', true] }, 1, 0]
                            }
                        },
                        walletsWithBalance: {
                            $sum: {
                                $cond: [{ $gt: ['$wallet.balance', 0] }, 1, 0]
                            }
                        }
                    }
                }
            ]);

            return stats[0] || {
                totalUsers: 0,
                totalWalletBalance: 0,
                activeWallets: 0,
                walletsWithBalance: 0
            };

        } catch (error) {
            console.error('Error getting wallet stats:', error);
            throw error;
        }
    }
};

export default walletService;