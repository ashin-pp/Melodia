import razorpay from '../../config/razorpay.js';
import Order from '../../model/orderSchema.js';
import User from '../../model/userSchema.js';
import crypto from 'crypto';

// Create Razorpay order
export const createRazorpayOrder = async (req, res) => {
    try {
        const { amount, currency = 'INR', orderId } = req.body;

        if (!amount || !orderId) {
            return res.status(400).json({
                success: false,
                message: 'Amount and Order ID are required'
            });
        }

        // Check if Razorpay is configured
        if (!razorpay) {
            return res.status(503).json({
                success: false,
                message: 'Payment gateway not configured. Please use wallet payment or contact support.'
            });
        }

        const options = {
            amount: Math.round(amount * 100), // Convert to paise
            currency,
            receipt: orderId,
            payment_capture: 1
        };

        const razorpayOrder = await razorpay.orders.create(options);

        // Update order with Razorpay order ID
        await Order.findOneAndUpdate(
            { orderId },
            { razorpayOrderId: razorpayOrder.id }
        );

        res.json({
            success: true,
            data: {
                orderId: razorpayOrder.id,
                amount: razorpayOrder.amount,
                currency: razorpayOrder.currency,
                key: process.env.RAZORPAY_KEY_ID
            }
        });
    } catch (error) {
        console.error('Error creating Razorpay order:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create payment order'
        });
    }
};

// Verify Razorpay payment
export const verifyPayment = async (req, res) => {
    try {
        const {
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature,
            orderId
        } = req.body;

        // Verify signature
        const body = razorpay_order_id + "|" + razorpay_payment_id;
        const expectedSignature = crypto
            .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
            .update(body.toString())
            .digest('hex');

        const isAuthentic = expectedSignature === razorpay_signature;

        if (isAuthentic) {
            // Update order with payment details
            const order = await Order.findOneAndUpdate(
                { orderId },
                {
                    paymentStatus: 'Paid',
                    razorpayOrderId: razorpay_order_id,
                    razorpayPaymentId: razorpay_payment_id,
                    razorpaySignature: razorpay_signature,
                    orderStatus: 'Confirmed'
                },
                { new: true }
            );

            if (!order) {
                return res.status(404).json({
                    success: false,
                    message: 'Order not found'
                });
            }

            res.json({
                success: true,
                message: 'Payment verified successfully',
                orderId: order.orderId
            });
        } else {
            // Payment verification failed
            await Order.findOneAndUpdate(
                { orderId },
                { paymentStatus: 'Failed' }
            );

            res.status(400).json({
                success: false,
                message: 'Payment verification failed'
            });
        }
    } catch (error) {
        console.error('Error verifying payment:', error);
        res.status(500).json({
            success: false,
            message: 'Payment verification failed'
        });
    }
};

// Handle payment failure
export const handlePaymentFailure = async (req, res) => {
    try {
        const { orderId, error } = req.body;

        await Order.findOneAndUpdate(
            { orderId },
            {
                paymentStatus: 'Failed',
                notes: error?.description || 'Payment failed'
            }
        );

        res.json({
            success: true,
            message: 'Payment failure recorded'
        });
    } catch (error) {
        console.error('Error handling payment failure:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to record payment failure'
        });
    }
};

// Process wallet payment
export const processWalletPayment = async (req, res) => {
    try {
        const { orderId, amount } = req.body;
        const userId = req.session.user.id;

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        if (user.wallet.balance < amount) {
            return res.status(400).json({
                success: false,
                message: 'Insufficient wallet balance'
            });
        }

        // Deduct from wallet using wallet service
        const walletService = (await import('../../services/walletService.js')).default;
        
        const deductResult = await walletService.deductMoney(
            userId,
            amount,
            `Payment for order ${orderId}`,
            orderId
        );

        if (!deductResult.success) {
            return res.status(400).json({
                success: false,
                message: deductResult.error || 'Wallet payment failed'
            });
        }

        // Update order
        await Order.findOneAndUpdate(
            { orderId },
            {
                paymentStatus: 'Paid',
                paymentMethod: 'WALLET',
                orderStatus: 'Confirmed'
            }
        );

        res.json({
            success: true,
            message: 'Wallet payment processed successfully',
            remainingBalance: user.wallet.balance
        });
    } catch (error) {
        console.error('Error processing wallet payment:', error);
        res.status(500).json({
            success: false,
            message: 'Wallet payment failed'
        });
    }
};

export default {
    createRazorpayOrder,
    verifyPayment,
    handlePaymentFailure,
    processWalletPayment
};