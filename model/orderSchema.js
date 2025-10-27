import mongoose from 'mongoose';

const orderItemSchema = new mongoose.Schema({
  variantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Variant',
    required: true
  },
  quantity: {
    type: Number,
    required: true,
    min: 1
  },
  price: {
    type: Number,
    required: true
  },
  totalPrice: {
    type: Number,
    required: true
  },
  productName: {
    type: String
  },
  color: {
    type: String
  },
  size: {
    type: String
  },
  status: {
    type: String,
    enum: ['Pending', 'Confirmed', 'Processing', 'Shipped', 'Out for Delivery', 'Delivered', 'Cancelled', 'Returned'],
    default: 'Pending'
  },
  statusHistory: [{
    status: String,
    updatedAt: {
      type: Date,
      default: Date.now
    },
    reason: String
  }],
  trackingNumber: {
    type: String
  },
  deliveredAt: {
    type: Date
  },
  cancelledAt: {
    type: Date
  },
  returnedAt: {
    type: Date
  },
  cancellationReason: {
    type: String
  },
  returnReason: {
    type: String
  }
});

const orderSchema = new mongoose.Schema({
  orderId: {
    type: String,
    unique: true,
    required: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  items: [orderItemSchema],
  shippingAddress: {
    fullName: { type: String, required: true },
    phoneNumber: { type: String, required: true },
    addressLine1: { type: String, required: true },
    addressLine2: { type: String },
    city: { type: String, required: true },
    state: { type: String, required: true },
    pincode: { type: String, required: true },
    country: { type: String, required: true }
  },
  paymentMethod: {
    type: String,
    enum: ['COD', 'RAZORPAY', 'WALLET', 'CARD'],
    default: 'COD'
  },
  paymentStatus: {
    type: String,
    enum: ['Pending', 'Paid', 'Failed', 'Refunded'],
    default: 'Pending'
  },
  razorpayOrderId: {
    type: String
  },
  razorpayPaymentId: {
    type: String
  },
  razorpaySignature: {
    type: String
  },
  couponCode: {
    type: String
  },
  couponDiscount: {
    type: Number,
    default: 0
  },
  offerDiscount: {
    type: Number,
    default: 0
  },
  orderStatus: {
    type: String,
    enum: ['Pending', 'Confirmed', 'Processing', 'Shipped', 'Delivered', 'Cancelled', 'Returned'],
    default: 'Pending'
  },
  subtotal: {
    type: Number,
    required: true
  },
  shippingCost: {
    type: Number,
    default: 0
  },
  taxAmount: {
    type: Number,
    default: 0
  },
  discountAmount: {
    type: Number,
    default: 0
  },
  totalAmount: {
    type: Number,
    required: true
  },
  orderDate: {
    type: Date,
    default: Date.now
  },
  expectedDeliveryDate: {
    type: Date
  },
  deliveredDate: {
    type: Date
  },
  notes: {
    type: String
  },
  trackingNumber: {
    type: String
  },
  cancellationReason: {
    type: String,
    trim: true
  },
  returnReason: {
    type: String,
    trim: true
  },
  cancelledAt: {
    type: Date
  },
  returnedAt: {
    type: Date
  },
  cancelledItems: [{
    variantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Variant'
    },
    quantity: Number,
    reason: String,
    cancelledAt: {
      type: Date,
      default: Date.now
    }
  }],
  // Wallet and refund tracking fields
  walletAmountUsed: {
    type: Number,
    default: 0
  },
  refundStatus: {
    type: String,
    enum: ['none', 'pending', 'processed', 'rejected'],
    default: 'none'
  },
  refundAmount: {
    type: Number,
    default: 0
  },
  refundReason: {
    type: String
  },
  refundProcessedAt: {
    type: Date
  },
  refundProcessedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin'
  },
  returnRequests: [{
    itemId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true
    },
    reason: {
      type: String,
      required: true
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending'
    },
    requestedAt: {
      type: Date,
      default: Date.now
    },
    processedAt: {
      type: Date
    },
    processedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin'
    },
    refundAmount: {
      type: Number,
      default: 0
    },
    adminNotes: {
      type: String
    },
    images: [String]
  }]
}, {
  timestamps: true
});

// Generate unique order ID
orderSchema.pre('save', async function (next) {
  if (!this.orderId) {
    const timestamp = Date.now().toString();
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    this.orderId = `ORD${timestamp}${random}`;
  }
  next();
});

// Method to calculate total amount
orderSchema.methods.calculateTotal = function () {
  this.subtotal = this.items.reduce((sum, item) => sum + item.totalPrice, 0);
  this.totalAmount = this.subtotal + this.shippingCost + this.taxAmount - this.discountAmount;
  return this.totalAmount;
};

// Method to update order status
orderSchema.methods.updateStatus = async function (newStatus) {
  this.orderStatus = newStatus;
  if (newStatus === 'Delivered') {
    this.deliveredDate = new Date();
  } else if (newStatus === 'Cancelled') {
    this.cancelledAt = new Date();
  } else if (newStatus === 'Returned') {
    this.returnedAt = new Date();
  }
  return await this.save();
};

// Method to cancel entire order
orderSchema.methods.cancelOrder = async function (reason) {
  this.orderStatus = 'Cancelled';
  this.cancellationReason = reason;
  this.cancelledAt = new Date();
  return await this.save();
};

// Method to return order
orderSchema.methods.returnOrder = async function (reason) {
  this.orderStatus = 'Returned';
  this.returnReason = reason;
  this.returnedAt = new Date();
  return await this.save();
};

// Method to cancel specific items
orderSchema.methods.cancelItems = async function (itemsToCancel, reason) {
  console.log('=== cancelItems method called ===');
  console.log('Items to cancel:', itemsToCancel);
  
  itemsToCancel.forEach(item => {
    console.log(`Processing cancellation for variant ${item.variantId}, quantity: ${item.quantity}`);
    
    // Add to cancelled items
    this.cancelledItems.push({
      variantId: item.variantId,
      quantity: item.quantity,
      reason: reason
    });

    // SIMPLE FIX: Just update the item status to 'Cancelled' like returns
    console.log('Looking for item with variantId:', item.variantId);
    console.log('Available items:', this.items.map(i => ({ id: i._id, variantId: i.variantId.toString(), status: i.status })));
    
    const originalItem = this.items.find(orderItem => {
      // Handle different variantId formats
      const orderVariantId = orderItem.variantId._id ? orderItem.variantId._id.toString() : orderItem.variantId.toString();
      const cancelVariantId = item.variantId._id ? item.variantId._id.toString() : item.variantId.toString();
      
      const match = orderVariantId === cancelVariantId;
      console.log(`Comparing ${orderVariantId} === ${cancelVariantId}: ${match}`);
      return match;
    });
    
    if (originalItem) {
      console.log(`✅ Found original item - Setting status to Cancelled`);
      console.log(`Before: Status = ${originalItem.status}`);
      
      // Set status to Cancelled (same as returns)
      originalItem.status = 'Cancelled';
      originalItem.cancelledAt = new Date();
      originalItem.cancellationReason = reason;
      
      // Add to status history
      if (!originalItem.statusHistory) {
        originalItem.statusHistory = [];
      }
      originalItem.statusHistory.push({
        status: 'Cancelled',
        updatedAt: new Date(),
        reason: reason
      });
      
      console.log(`After: Status = ${originalItem.status}`);
    } else {
      console.log('❌ Original item not found with primary search!');
      
      // Try alternative search methods
      console.log('Trying alternative search...');
      const altItem = this.items.find(orderItem => {
        // Try matching by index or other properties
        return orderItem._id.toString() === item.itemId || 
               orderItem.variantId.toString().includes(item.variantId) ||
               item.variantId.toString().includes(orderItem.variantId.toString());
      });
      
      if (altItem) {
        console.log('✅ Found item with alternative search - Setting status to Cancelled');
        altItem.status = 'Cancelled';
        altItem.cancelledAt = new Date();
        altItem.cancellationReason = reason;
        
        if (!altItem.statusHistory) {
          altItem.statusHistory = [];
        }
        altItem.statusHistory.push({
          status: 'Cancelled',
          updatedAt: new Date(),
          reason: reason
        });
      } else {
        console.log('❌ Item still not found with alternative search!');
        console.log('Search variantId:', item.variantId);
        console.log('Available items:', this.items.map(i => ({
          id: i._id.toString(),
          variantId: i.variantId.toString(),
          status: i.status
        })));
      }
    }
  });

  // Recalculate total amount
  this.calculateTotal();

  // Check if all items are cancelled
  const activeItems = this.items.filter(item => item.status !== 'Cancelled' && item.quantity > 0);
  console.log(`Active items remaining: ${activeItems.length}`);
  
  if (activeItems.length === 0) {
    console.log('All items cancelled - marking order as cancelled');
    this.orderStatus = 'Cancelled';
    this.cancelledAt = new Date();
  }

  console.log('=== Saving order ===');
  return await this.save();
};

const Order = mongoose.model('Order', orderSchema);
export default Order;