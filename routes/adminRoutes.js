import express from 'express';
const router = express.Router();
import adminCtrl from '../controller/Admin/adminController.js';
import { validateAdminSession, adminAuth } from '../middleware/adminAuth.js';
import customerCtrl from '../controller/Admin/customerController.js';
import productCtrl from '../controller/Admin/productController.js';
import { uploadProductImages } from '../config/multer.js';
import categoryController from '../controller/Admin/categoryController.js';
import adminOrderCtrl from '../controller/Admin/orderController.js';
import couponCtrl from '../controller/Admin/couponController.js';
import salesReportCtrl from '../controller/Admin/salesReportController.js';
import referralService from '../services/referralService.js';


router.get('/login', adminCtrl.getLogin);
router.post('/login', adminCtrl.postLogin);

router.use(validateAdminSession)
//protected routes
router.get('/dashboard', adminAuth, adminCtrl.getDashboard);


router.get('/customer', customerCtrl.getUsers)
router.post('/customer/:id/toggle', customerCtrl.toggleBlockStatus);
router.get('/logout', adminAuth, adminCtrl.logout);

router.get('/products', productCtrl.getProducts);
router.get('/products/add', productCtrl.getAddProduct);
router.post('/products/add', uploadProductImages.any(), productCtrl.postAddProduct);
router.get('/products/:id/edit', productCtrl.getEditProduct);
router.post('/products/:id/edit', uploadProductImages.any(), productCtrl.postEditProduct);
router.post('/products/:id/edit-image', uploadProductImages.single('image'), productCtrl.uploadProductImage);


// Category
router.get('/category', categoryController.getCategories);
router.get('/category/add', categoryController.getAddCategory);
router.post('/category/add', categoryController.postAddCategory);
router.get('/category/:id/edit', categoryController.getEditCategory);
router.post('/category/:id/edit', categoryController.postEditCategory);


// Order Management routes
router.get('/orders', adminAuth, adminOrderCtrl.renderOrdersPage);
router.get('/api/orders', adminAuth, adminOrderCtrl.listOrder);
router.put('/api/orders/items/:itemId/status', adminAuth, adminOrderCtrl.updateItemStatus);
router.put('/api/orders/:orderId/status', adminAuth, adminOrderCtrl.updateOrderStatus);
router.get('/orders/:orderId', adminAuth, adminOrderCtrl.getAdminOrderDetails);
router.get('/orders/:orderId/invoice', adminAuth, adminOrderCtrl.downloadInvoice);

// Coupon Management routes
router.get('/coupons', adminAuth, couponCtrl.getCoupons);
router.post('/coupons/create', adminAuth, couponCtrl.createCoupon);
router.get('/coupons/:id', adminAuth, couponCtrl.getCoupon);
router.put('/coupons/:id', adminAuth, couponCtrl.updateCoupon);
router.post('/coupons/:id/toggle', adminAuth, couponCtrl.toggleCouponStatus);
router.delete('/coupons/:id', adminAuth, couponCtrl.deleteCoupon);

// Offer routes removed - using existing offer system





// Sales Report routes
router.get('/sales-report', adminAuth, salesReportCtrl.getSalesReportPage);
router.get('/api/sales-report', adminAuth, salesReportCtrl.getSalesReportData);
router.get('/generate-ledger', adminAuth, salesReportCtrl.generateLedger);
router.get('/reports/download/excel', adminAuth, salesReportCtrl.downloadExcelReport);
router.get('/reports/download/pdf', adminAuth, salesReportCtrl.downloadPDFReport);

// Return Management routes (moved to order controller)
router.put('/api/orders/items/:itemId/return/approve', adminAuth, adminOrderCtrl.approveReturnRequest);
router.put('/api/orders/items/:itemId/return/reject', adminAuth, adminOrderCtrl.rejectReturnRequest);

// Alternative routes for backward compatibility (if frontend uses different routes)
router.post('/api/orders/items/:itemId/return/approve', adminAuth, adminOrderCtrl.approveReturnRequest);
router.post('/api/orders/items/:itemId/return/reject', adminAuth, adminOrderCtrl.rejectReturnRequest);

// Legacy route for existing frontend (uses returnRequestId instead of itemId)
router.put('/api/return-requests/:returnRequestId/process', adminAuth, adminOrderCtrl.processReturnRequestLegacy);

// Referral Analytics routes
router.get('/api/referral/analytics', adminAuth, async (req, res) => {
  try {
    const analytics = await referralService.getReferralAnalytics();
    res.json(analytics);
  } catch (error) {
    console.error('Error getting referral analytics:', error);
    res.status(500).json({ success: false, message: 'Failed to get analytics' });
  }
});

router.get('/api/referral/leaderboard', adminAuth, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const leaderboard = await referralService.getReferralLeaderboard(limit);
    res.json(leaderboard);
  } catch (error) {
    console.error('Error getting referral leaderboard:', error);
    res.status(500).json({ success: false, message: 'Failed to get leaderboard' });
  }
});

export default router;