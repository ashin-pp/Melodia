import mongoose from 'mongoose';

const {Schema} = mongoose;

const userSchema = new Schema({
  name: {
    type: String,
    required: true
  },
  password: {
    type: String,
    required: false
  },
  email: {
    type: String,
    required: true,
    unique: true
  },
  phone: {
    type: String,
    required: false,
    unique: false,
    sparse: true,
    default: null
  },
  googleId: {
    type: String,
    unique: true,
    sparse: true
  },
  isBlocked: {
    type: Boolean,
    default: false
  },
  createdOn: {
    type: Date,
    default: Date.now
  },
  isAdmin: {
    type: Boolean,
    default: false
  },
  avatar: {
    type: Object
  },
  role: { 
    type: String, 
    enum: ['user', 'admin'], 
    default: 'user' 
  },
  // Referral system
  referralCode: {
    type: String,
    unique: true,
    sparse: true
  },
  referredBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  referrals: [{
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    joinedAt: {
      type: Date,
      default: Date.now
    },
    rewardGiven: {
      type: Boolean,
      default: false
    }
  }],
  referralStats: {
    totalReferrals: {
      type: Number,
      default: 0
    },
    totalRewards: {
      type: Number,
      default: 0
    }
  },
  // Enhanced Wallet functionality
  wallet: {
    balance: {
      type: Number,
      default: 0,
      min: 0
    },
    transactions: [{
      type: {
        type: String,
        enum: ['credit', 'debit'],
        required: true
      },
      amount: {
        type: Number,
        required: true,
        min: 0
      },
      description: {
        type: String,
        required: true
      },
      orderId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Order'
      },
      transactionId: {
        type: String,
        unique: true,
        sparse: true
      },
      balanceAfter: {
        type: Number,
        required: true
      },
      createdAt: {
        type: Date,
        default: Date.now
      },
      adminId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Admin'
      },
      metadata: {
        paymentMethod: String,
        refundType: String,
        originalTransactionId: String
      }
    }],
    isWalletActive: {
      type: Boolean,
      default: true
    }
  }
})

// Create indexes for efficient wallet queries
userSchema.index({ 'wallet.transactions.createdAt': -1 });
userSchema.index({ 'wallet.transactions.orderId': 1 });
userSchema.index({ 'wallet.transactions.transactionId': 1 });
userSchema.index({ 'referralCode': 1 });

// Generate referral code before saving
userSchema.pre('save', function(next) {
  if (this.isNew && !this.referralCode) {
    this.referralCode = this.generateReferralCode();
  }
  next();
});

// Method to generate unique referral code
userSchema.methods.generateReferralCode = function() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

const User = mongoose.model('User', userSchema);

export default User;