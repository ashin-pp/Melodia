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

// Method to calculate total amount (excluding cancelled items)
orderSchema.methods.calculateTotal = function () {
  // Only include items that are not cancelled
  const activeItems = this.items.filter(item => item.status !== 'Cancelled');
  this.subtotal = activeItems.reduce((sum, item) => sum + item.totalPrice, 0);

  // Recalculate shipping cost based on new subtotal
  // If subtotal becomes 0 or very low, shipping might still apply
  if (this.subtotal === 0) {
    this.shippingCost = 0;
  } else if (this.subtotal < 500 && this.shippingCost === 0) {
    // If original order had free shipping but now below threshold, add shipping
    // You might want to adjust this logic based on your business rules
    this.shippingCost = 50;
  }

  // Recalculate tax based on new subtotal
  const taxRate = 0.18; // 18% GST
  this.taxAmount = Math.round(this.subtotal * taxRate);

  // Recalculate total
  this.totalAmount = this.subtotal + this.shippingCost + this.taxAmount - this.discountAmount - this.couponDiscount;

  // Ensure total is not negative
  if (this.totalAmount < 0) {
    this.totalAmount = 0;
  }

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

// Method to get current active total (excluding cancelled items)
orderSchema.methods.getActiveTotal = function () {
  const activeItems = this.items.filter(item => item.status !== 'Cancelled');
  const activeSubtotal = activeItems.reduce((sum, item) => sum + item.totalPrice, 0);

  // Calculate shipping for active items
  let activeShippingCost = 0;
  if (activeSubtotal > 0) {
    activeShippingCost = activeSubtotal > 500 ? 0 : 50;
  }

  // Calculate tax for active items
  const activeTaxAmount = Math.round(activeSubtotal * 0.18);

  // Calculate active total
  const activeTotal = activeSubtotal + activeShippingCost + activeTaxAmount - this.discountAmount - this.couponDiscount;

  return {
    subtotal: activeSubtotal,
    shippingCost: activeShippingCost,
    taxAmount: activeTaxAmount,
    totalAmount: Math.max(0, activeTotal),
    activeItemsCount: activeItems.length
  };
};

// Method to cancel specific items
orderSchema.methods.cancelItems = async function (itemsToCancel, reason) {
  console.log('=== cancelItems method called ===');
  console.log('Items to cancel:', itemsToCancel);
  console.log('Original total amount:', this.totalAmount);

  let cancelledAmount = 0;

  itemsToCancel.forEach(item => {
    console.log(`Processing cancellation for variant ${item.variantId}, quantity: ${item.quantity}`);

    // Add to cancelled items
    this.cancelledItems.push({
      variantId: item.variantId,
      quantity: item.quantity,
      reason: reason
    });

    console.log('Looking for item with variantId:', item.variantId);

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
      console.log(`Before: Status = ${originalItem.status}, Price = ${originalItem.totalPrice}`);

      // Calculate cancelled amount for this item
      cancelledAmount += originalItem.totalPrice;

      // Set status to Cancelled
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
      const altItem = this.items.find(orderItem => {
        return orderItem._id.toString() === item.itemId ||
          orderItem.variantId.toString().includes(item.variantId) ||
          item.variantId.toString().includes(orderItem.variantId.toString());
      });

      if (altItem) {
        console.log('✅ Found item with alternative search - Setting status to Cancelled');
        cancelledAmount += altItem.totalPrice;

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
      }
    }
  });

  console.log(`Total cancelled amount: ${cancelledAmount}`);

  // Recalculate total amount excluding cancelled items
  const activeTotal = this.getActiveTotal();

  // Update order totals
  this.subtotal = activeTotal.subtotal;
  this.shippingCost = activeTotal.shippingCost;
  this.taxAmount = activeTotal.taxAmount;
  this.totalAmount = activeTotal.totalAmount;

  console.log(`Updated totals - Subtotal: ${this.subtotal}, Shipping: ${this.shippingCost}, Tax: ${this.taxAmount}, Total: ${this.totalAmount}`);

  // Check if all items are cancelled
  const activeItems = this.items.filter(item => item.status !== 'Cancelled');
  console.log(`Active items remaining: ${activeItems.length}`);

  if (activeItems.length === 0) {
    console.log('All items cancelled - marking order as cancelled');
    this.orderStatus = 'Cancelled';
    this.cancelledAt = new Date();
    this.totalAmount = 0;
  }

  console.log('=== Saving order with updated totals ===');
  return await this.save();
};

const Order = mongoose.model('Order', orderSchema);
export default Order;