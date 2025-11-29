import Coupon from '../../model/couponSchema.js';
import User from '../../model/userSchema.js';
import Product from '../../model/productSchema.js';
import Category from '../../model/categorySchema.js';

export const getCoupons = async (req, res) => {
    try {
        const coupons = await Coupon.find()
            .populate('applicableCategories', 'name')
            .populate('applicableProducts', 'productName brand')
            .sort({ createdAt: -1 });

        res.render('admin/coupons', {
            coupons,
            title: 'Coupons - Admin'
        });
    } catch (error) {
        console.error('Error fetching coupons:', error);
        res.status(500).render('error/500');
    }
};

export const createCoupon = async (req, res) => {
    try {
        const {
            code,
            name,
            description,
            discountType,
            discountValue,
            maxDiscountAmount,
            minimumOrderAmount,
            startDate,
            endDate,
            usagePerUser,
            applicableCategories,
            applicableProducts
        } = req.body;

        // Validation
        if (!code || !name || !discountType || !discountValue || !startDate || !endDate) {
            return res.json({ success: false, message: 'All required fields must be filled' });
        }

        // Check if coupon code already exists
        const existingCoupon = await Coupon.findOne({ code: code.toUpperCase() });
        if (existingCoupon) {
            return res.json({ success: false, message: 'Coupon code already exists' });
        }

        // Validate dates
        const start = new Date(startDate);
        const end = new Date(endDate);
        if (start >= end) {
            return res.json({ success: false, message: 'End date must be after start date' });
        }

        // Validate discount value
        const discount = parseFloat(discountValue);
        if (discountType === 'percentage' && (discount <= 0 || discount > 100)) {
            return res.json({ success: false, message: 'Percentage discount must be between 1 and 100' });
        }
        if (discountType === 'fixed' && discount <= 0) {
            return res.json({ success: false, message: 'Fixed discount must be greater than 0' });
        }

        const coupon = new Coupon({
            code: code.toUpperCase(),
            name: name.toUpperCase(),
            description,
            discountType,
            discountValue: discount,
            maxDiscountAmount: maxDiscountAmount ? parseFloat(maxDiscountAmount) : null,
            minimumOrderAmount: minimumOrderAmount ? parseFloat(minimumOrderAmount) : 0,
            startDate: start,
            endDate: end,
            usagePerUser: usagePerUser ? parseInt(usagePerUser) : 1,
            applicableCategories: applicableCategories || [],
            applicableProducts: applicableProducts || [],
            createdBy: req.session.admin?.id || 'admin'
        });

        await coupon.save();
        res.json({ success: true, message: 'Coupon created successfully' });
    } catch (error) {
        console.error('Error creating coupon:', error);
        res.json({ success: false, message: error.message });
    }
};

export const toggleCouponStatus = async (req, res) => {
    try {
        const coupon = await Coupon.findById(req.params.id);
        if (!coupon) {
            return res.json({ success: false, message: 'Coupon not found' });
        }

        coupon.isActive = !coupon.isActive;
        await coupon.save();
        res.json({ success: true, message: `Coupon ${coupon.isActive ? 'activated' : 'deactivated'}` });
    } catch (error) {
        res.json({ success: false, message: error.message });
    }
};

export const deleteCoupon = async (req, res) => {
    try {
        await Coupon.findByIdAndDelete(req.params.id);
        res.json({ success: true, message: 'Coupon deleted successfully' });
    } catch (error) {
        res.json({ success: false, message: error.message });
    }
};

// Get coupon for editing
export const getCoupon = async (req, res) => {
    try {
        const { id } = req.params;
        const coupon = await Coupon.findById(id)
            .populate('applicableCategories', 'name')
            .populate('applicableProducts', 'productName brand');

        if (!coupon) {
            return res.status(404).json({
                success: false,
                message: 'Coupon not found'
            });
        }

        res.json({
            success: true,
            coupon
        });
    } catch (error) {
        console.error('Error fetching coupon:', error);
        res.status(500).json({
            success: false,
            message: 'Server error occurred'
        });
    }
};

// Update coupon
export const updateCoupon = async (req, res) => {
    try {
        const { id } = req.params;
        const {
            code,
            name,
            description,
            discountType,
            discountValue,
            maxDiscountAmount,
            minimumOrderAmount,
            startDate,
            endDate,
            usagePerUser,
            applicableCategories,
            applicableProducts
        } = req.body;

        // Validation
        if (!name || !discountType || !discountValue || !startDate || !endDate) {
            return res.status(400).json({
                success: false,
                message: 'All required fields must be filled'
            });
        }

        // Validate dates
        const start = new Date(startDate);
        const end = new Date(endDate);
        if (start >= end) {
            return res.status(400).json({
                success: false,
                message: 'End date must be after start date'
            });
        }

        // Validate discount value
        const discount = parseFloat(discountValue);
        if (discountType === 'percentage' && (discount <= 0 || discount > 100)) {
            return res.status(400).json({
                success: false,
                message: 'Percentage discount must be between 1 and 100'
            });
        }
        if (discountType === 'fixed' && discount <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Fixed discount must be greater than 0'
            });
        }

        const coupon = await Coupon.findById(id);
        if (!coupon) {
            return res.status(404).json({
                success: false,
                message: 'Coupon not found'
            });
        }

        // Check if code already exists (if code is being changed)
        if (code && code.toUpperCase() !== coupon.code) {
            const existingCoupon = await Coupon.findOne({ 
                code: code.toUpperCase(), 
                _id: { $ne: id } 
            });
            if (existingCoupon) {
                return res.status(400).json({
                    success: false,
                    message: 'Coupon code already exists'
                });
            }
        }

        // Update coupon fields
        if (code) coupon.code = code.toUpperCase();
        coupon.name = name.toUpperCase();
        coupon.description = description;
        coupon.discountType = discountType;
        coupon.discountValue = parseFloat(discountValue);
        coupon.maxDiscountAmount = maxDiscountAmount ? parseFloat(maxDiscountAmount) : null;
        coupon.minimumOrderAmount = minimumOrderAmount ? parseFloat(minimumOrderAmount) : 0;
        coupon.startDate = new Date(startDate);
        coupon.endDate = new Date(endDate);
        coupon.usagePerUser = usagePerUser ? parseInt(usagePerUser) : 1;

        await coupon.save();

        res.json({
            success: true,
            message: 'Coupon updated successfully'
        });
    } catch (error) {
        console.error('Error updating coupon:', error);
        res.status(500).json({
            success: false,
            message: error.message || 'Server error occurred'
        });
    }
};

export default {
    getCoupons,
    createCoupon,
    getCoupon,
    updateCoupon,
    toggleCouponStatus,
    deleteCoupon
};