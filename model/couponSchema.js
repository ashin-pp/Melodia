import mongoose from 'mongoose';

const couponSchema = new mongoose.Schema({
    code: {
        type: String,
        required: true,
        unique: true,
        uppercase: true,
        trim: true,
        minlength: 3,
        maxlength: 20
    },
    name: {
        type: String,
        required: true,
        trim: true
    },
    description: {
        type: String,
        trim: true
    },
    discountType: {
        type: String,
        enum: ['percentage', 'fixed'],
        required: true
    },
    discountValue: {
        type: Number,
        required: true,
        min: 0
    },
    maxDiscountAmount: {
        type: Number,
        default: null
    },
    minimumOrderAmount: {
        type: Number,
        default: 0,
        min: 0
    },
    startDate: {
        type: Date,
        required: true
    },
    endDate: {
        type: Date,
        required: true
    },
    usageLimit: {
        type: Number,
        default: null,
        min: 1
    },
    usagePerUser: {
        type: Number,
        default: 1,
        min: 1
    },
    usedCount: {
        type: Number,
        default: 0,
        min: 0
    },
    isActive: {
        type: Boolean,
        default: true
    },
    applicableCategories: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Category'
    }],
    applicableProducts: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product'
    }],
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    // Referral coupon specific fields
    isReferralCoupon: {
        type: Boolean,
        default: false
    },
    applicableUsers: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    maxUsageCount: {
        type: Number,
        default: null
    }
}, {
    timestamps: true
});

// Validation middleware
couponSchema.pre('save', function(next) {
    if (this.startDate >= this.endDate) {
        return next(new Error('End date must be after start date'));
    }
    
    if (this.discountType === 'percentage' && this.discountValue > 100) {
        return next(new Error('Percentage discount cannot exceed 100%'));
    }
    
    next();
});

// Virtual to check if coupon is currently valid
couponSchema.virtual('isCurrentlyValid').get(function() {
    const now = new Date();
    return this.isActive && 
           this.startDate <= now && 
           this.endDate >= now &&
           (this.usageLimit === null || this.usedCount < this.usageLimit);
});

// Method to calculate discount amount
couponSchema.methods.calculateDiscount = function(orderAmount) {
    if (!this.isCurrentlyValid) {
        return 0;
    }
    
    if (orderAmount < this.minimumOrderAmount) {
        return 0;
    }
    
    let discount = 0;
    
    if (this.discountType === 'percentage') {
        discount = (orderAmount * this.discountValue) / 100;
        if (this.maxDiscountAmount && discount > this.maxDiscountAmount) {
            discount = this.maxDiscountAmount;
        }
    } else {
        discount = this.discountValue;
    }
    
    return Math.min(discount, orderAmount);
};

export default mongoose.model('Coupon', couponSchema);