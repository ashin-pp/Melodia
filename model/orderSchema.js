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
    enum: ['Pending', 'Confirmed', 'Processing', 'Shipped', 'Out for Delivery', 'Delivered', 'Cancelled', 'Returned'],
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
  console.log('=== ORDER SCHEMA cancelItems method called ===');
  console.log('Items to cancel:', itemsToCancel);
  console.log('Original order totals:', {
    subtotal: this.subtotal,
    shippingCost: this.shippingCost,
    taxAmount: this.taxAmount,
    totalAmount: this.totalAmount
  });

  let totalCancelledAmount = 0;

  // Process each item to cancel
  for (const itemToCancel of itemsToCancel) {
    console.log(`\n🔍 Processing cancellation for variant ${itemToCancel.variantId}, quantity: ${itemToCancel.quantity}`);

    // Add to cancelled items list
    this.cancelledItems.push({
      variantId: itemToCancel.variantId,
      quantity: itemToCancel.quantity,
      reason: reason
    });

    // Find the original item in the order
    const originalItem = this.items.find(orderItem => {
      const orderVariantId = orderItem.variantId._id ? orderItem.variantId._id.toString() : orderItem.variantId.toString();
      const cancelVariantId = itemToCancel.variantId._id ? itemToCancel.variantId._id.toString() : itemToCancel.variantId.toString();

      const match = orderVariantId === cancelVariantId;
      console.log(`Comparing ${orderVariantId} === ${cancelVariantId}: ${match}`);
      return match;
    });

    if (originalItem) {
      console.log(`✅ Found original item:`, {
        variantId: originalItem.variantId,
        quantity: originalItem.quantity,
        price: originalItem.price,
        totalPrice: originalItem.totalPrice,
        currentStatus: originalItem.status
      });

      // Handle partial or full cancellation
      if (itemToCancel.quantity >= originalItem.quantity) {
        // Full item cancellation
        console.log('📝 Full item cancellation');
        totalCancelledAmount += originalItem.totalPrice;

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

        console.log(`✅ Item fully cancelled. Refund amount: ₹${originalItem.totalPrice}`);
      } else {
        // Partial item cancellation - reduce quantity and recalculate price
        console.log('📝 Partial item cancellation');

        const pricePerUnit = originalItem.price;
        const cancelledValue = pricePerUnit * itemToCancel.quantity;
        totalCancelledAmount += cancelledValue;

        // Update item quantity and total price
        originalItem.quantity -= itemToCancel.quantity;
        originalItem.totalPrice = originalItem.quantity * pricePerUnit;

        console.log(`✅ Item partially cancelled:`, {
          originalQuantity: originalItem.quantity + itemToCancel.quantity,
          newQuantity: originalItem.quantity,
          cancelledQuantity: itemToCancel.quantity,
          pricePerUnit: pricePerUnit,
          cancelledValue: cancelledValue,
          newTotalPrice: originalItem.totalPrice
        });
      }
    } else {
      console.log('❌ Original item not found! Trying alternative search...');

      // Try alternative search methods
      const altItem = this.items.find(orderItem => {
        return orderItem._id.toString() === itemToCancel.itemId ||
          orderItem.variantId.toString().includes(itemToCancel.variantId) ||
          itemToCancel.variantId.toString().includes(orderItem.variantId.toString());
      });

      if (altItem) {
        console.log('✅ Found item with alternative search - processing cancellation');

        if (itemToCancel.quantity >= altItem.quantity) {
          totalCancelledAmount += altItem.totalPrice;
          altItem.status = 'Cancelled';
          altItem.cancelledAt = new Date();
          altItem.cancellationReason = reason;
        } else {
          const pricePerUnit = altItem.price;
          const cancelledValue = pricePerUnit * itemToCancel.quantity;
          totalCancelledAmount += cancelledValue;

          altItem.quantity -= itemToCancel.quantity;
          altItem.totalPrice = altItem.quantity * pricePerUnit;
        }

        if (!altItem.statusHistory) {
          altItem.statusHistory = [];
        }
        altItem.statusHistory.push({
          status: altItem.status === 'Cancelled' ? 'Cancelled' : 'Partially Cancelled',
          updatedAt: new Date(),
          reason: reason
        });
      } else {
        console.log('❌ Item not found in order!');
      }
    }
  }

  console.log(`\n💰 Total cancelled amount: ₹${totalCancelledAmount}`);

  // Recalculate order totals based on active (non-cancelled) items
  console.log('🔄 Recalculating order totals...');
  const activeItems = this.items.filter(item => item.status !== 'Cancelled' && item.quantity > 0);

  console.log(`Active items after cancellation: ${activeItems.length}`);

  if (activeItems.length === 0) {
    console.log('🚫 All items cancelled - setting order totals to 0');
    this.subtotal = 0;
    this.shippingCost = 0;
    this.taxAmount = 0;
    this.totalAmount = 0;
    this.orderStatus = 'Cancelled';
    this.cancelledAt = new Date();
  } else {
    // Recalculate subtotal from active items only
    const newSubtotal = activeItems.reduce((sum, item) => sum + item.totalPrice, 0);

    console.log(`Subtotal calculation: ${activeItems.length} active items = ₹${newSubtotal}`);

    this.subtotal = newSubtotal;

    // Recalculate shipping (free shipping if subtotal > 500)
    this.shippingCost = this.subtotal > 500 ? 0 : 50;

    // Recalculate tax (18% GST)
    this.taxAmount = Math.round(this.subtotal * 0.18);

    // Recalculate total (subtract discounts if any)
    this.totalAmount = this.subtotal + this.shippingCost + this.taxAmount - (this.discountAmount || 0) - (this.couponDiscount || 0);

    // Ensure total is not negative
    if (this.totalAmount < 0) {
      this.totalAmount = 0;
    }

    console.log(`Recalculated totals: Subtotal=₹${this.subtotal}, Shipping=₹${this.shippingCost}, Tax=₹${this.taxAmount}, Total=₹${this.totalAmount}`);
  }

  console.log('📊 Updated order totals:', {
    subtotal: this.subtotal,
    shippingCost: this.shippingCost,
    taxAmount: this.taxAmount,
    totalAmount: this.totalAmount,
    orderStatus: this.orderStatus
  });

  console.log('💾 Saving order with updated totals...');
  return await this.save();
};

const Order = mongoose.model('Order', orderSchema);
export default Order;