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

    // Update the status of the original item
    const originalItem = this.items.find(orderItem => 
      orderItem.variantId.toString() === item.variantId.toString()
    );
    
    if (originalItem) {
      console.log(`Found original item - Current quantity: ${originalItem.quantity}, Cancelling: ${item.quantity}`);
      
      // Check if the entire quantity is being cancelled
      if (item.quantity >= originalItem.quantity) {
        // Full cancellation - mark item as cancelled
        console.log('Full cancellation - setting status to Cancelled and quantity to 0');
        originalItem.status = 'Cancelled';
        originalItem.cancelledAt = new Date();
        originalItem.cancellationReason = reason;
        originalItem.quantity = 0; // Set quantity to 0 to ensure it's filtered out
        originalItem.totalPrice = 0; // Set total price to 0
      } else {
        // Partial cancellation - reduce quantity
        console.log('Partial cancellation - reducing quantity');
        originalItem.quantity -= item.quantity;
        originalItem.totalPrice = originalItem.quantity * originalItem.price;
      }
      
      // Add to status history
      if (!originalItem.statusHistory) {
        originalItem.statusHistory = [];
      }
      originalItem.statusHistory.push({
        status: originalItem.quantity <= 0 ? 'Cancelled' : 'Partially Cancelled',
        updatedAt: new Date(),
        reason: reason
      });
      
      console.log(`Updated item - Status: ${originalItem.status}, Quantity: ${originalItem.quantity}`);
    } else {
      console.log('Original item not found!');
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