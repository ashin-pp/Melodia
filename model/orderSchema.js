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
    enum: ['COD', 'UPI', 'WALLET', 'CARD'],
    default: 'COD'
  },
  paymentStatus: {
    type: String,
    enum: ['Pending', 'Paid', 'Failed', 'Refunded'],
    default: 'Pending'
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
  itemsToCancel.forEach(item => {
    // Add to cancelled items
    this.cancelledItems.push({
      variantId: item.variantId,
      quantity: item.quantity,
      reason: reason
    });

    // Update the status of the original item
    const originalItem = this.items.find(orderItem => 
      orderItem.variantId.toString() === item.variantId.toString()
    );
    if (originalItem) {
      originalItem.status = 'Cancelled';
      originalItem.cancelledAt = new Date();
      
      // Add to status history
      if (!originalItem.statusHistory) {
        originalItem.statusHistory = [];
      }
      originalItem.statusHistory.push({
        status: 'Cancelled',
        updatedAt: new Date(),
        reason: reason
      });
    }
  });

  // Check if all items are cancelled
  const totalCancelled = this.cancelledItems.reduce((sum, item) => sum + item.quantity, 0);
  const totalOrdered = this.items.reduce((sum, item) => sum + item.quantity, 0);

  if (totalCancelled >= totalOrdered) {
    this.orderStatus = 'Cancelled';
    this.cancelledAt = new Date();
  }

  return await this.save();
};

const Order = mongoose.model('Order', orderSchema);
export default Order;