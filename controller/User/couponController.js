import Coupon from '../../model/couponSchema.js';
import User from '../../model/userSchema.js';

// Apply coupon
export const applyCoupon = async (req, res) => {
    try {
        const { couponCode, orderAmount } = req.body;
        const userId = req.session.user.id;

        if (!couponCode || !orderAmount) {
            return res.status(400).json({
                success: false,
                message: 'Coupon code and order amount are required'
            });
        }

        // Find coupon
        const coupon = await Coupon.findOne({ 
            code: couponCode.toUpperCase(),
            isActive: true 
        });

        if (!coupon) {
            return res.status(404).json({
                success: false,
                message: 'Invalid coupon code'
            });
        }

        // Check if coupon is currently valid
        const now = new Date();
        if (now < coupon.startDate || now > coupon.endDate) {
            return res.status(400).json({
                success: false,
                message: 'Coupon has expired or not yet active'
            });
        }
     
        // Check usage limit
        if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) {
            return res.status(400).json({
                success: false,
                message: 'Coupon usage limit exceeded'
            });
        }
       
         const Order=(await import('../../model/orderSchema.js')).default;
         const userCouponUsage=await Order.countDocuments({
            userId:userId,
            couponCode:coupon.code,
            orderStatus: {$nin:['cancelled','failed']}

         })
        
         if(userCouponUsage>=coupon.usagePerUser){
            return res.status(400).json({
                success:false,
                message:'you have already used this coupon'
            });
         }

        // Check minimum order amount
        if (orderAmount < coupon.minimumOrderAmount) {
            return res.status(400).json({
                success: false,
                message: `Minimum order amount of ₹${coupon.minimumOrderAmount} required`
            });
        }

        // Calculate discount
        const discountAmount = coupon.calculateDiscount(orderAmount);

        if (discountAmount === 0) {
            return res.status(400).json({
                success: false,
                message: 'Coupon cannot be applied to this order'
            });
        }

        res.json({
            success: true,
            data: {
                couponCode: coupon.code,
                discountAmount,
                discountType: coupon.discountType,
                discountValue: coupon.discountValue,
                finalAmount: orderAmount - discountAmount
            }
        });
    } catch (error) {
        console.error('Error applying coupon:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to apply coupon'
        });
    }
};

// Remove coupon
export const removeCoupon = async (req, res) => {
    try {
        const { orderAmount } = req.body;

        res.json({
            success: true,
            data: {
                finalAmount: orderAmount,
                discountAmount: 0
            },
            message: 'Coupon removed successfully'
        });
    } catch (error) {
        console.error('Error removing coupon:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to remove coupon'
        });
    }
};

// Get available coupons for user
export const getAvailableCoupons = async (req, res) => {
    try {
        const { orderAmount } = req.query;
        const userId = req.session.user.id;
        const now = new Date();

        // Get all potentially available coupons
        const allCoupons = await Coupon.find({
            isActive: true,
            startDate: { $lte: now},
            endDate: { $gte: now },
            minimumOrderAmount: { $lte: orderAmount || 0 },
            $or: [
                { usageLimit: null },
                { $expr: { $lt: ['$usedCount', '$usageLimit'] } }
            ]
        }).select('code name description discountType discountValue maxDiscountAmount minimumOrderAmount usagePerUser');

        // Filter out coupons that user has already used up to their limit
        const Order = (await import('../../model/orderSchema.js')).default;
        const availableCoupons = [];

        for (const coupon of allCoupons) {
            // Check how many times this user has used this coupon
            const userUsageCount = await Order.countDocuments({
                userId: userId,
                couponCode: coupon.code,
                orderStatus: { $nin: ['Cancelled', 'cancelled', 'Failed', 'failed'] }
            });

            // Only include coupon if user hasn't reached their usage limit
            if (userUsageCount < coupon.usagePerUser) {
                availableCoupons.push(coupon);
            }
        }

        res.json({
            success: true,
            data: availableCoupons
        });
    } catch (error) {
        console.error('Error fetching available coupons:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch coupons'
        });
    }
};

export default {
    applyCoupon,
    removeCoupon,
    getAvailableCoupons
};