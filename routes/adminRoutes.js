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
router.get('/api/dashboard', adminAuth, adminCtrl.getDashboardAPI);

router.get('/customer', customerCtrl.getUsers)
router.post('/customer/:id/toggle', customerCtrl.toggleBlockStatus);
router.get('/logout', adminAuth, adminCtrl.logout);

router.get('/products', productCtrl.getProducts);
router.get('/products/add', productCtrl.getAddProduct);
router.post('/products/add', uploadProductImages.any(), productCtrl.postAddProduct);
router.get('/products/:id/edit', productCtrl.getEditProduct);
router.post('/products/:id/edit', uploadProductImages.any(), productCtrl.postEditProduct);
router.post('/products/:id/edit-image', uploadProductImages.single('image'), productCtrl.uploadProductImage);
router.post('/products/:id/toggle-premium', productCtrl.togglePremiumStatus);
router.delete('/variants/:id/delete', productCtrl.deleteVariant);


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

// Order Cancellation routes
router.post('/api/orders/:orderId/cancel', adminAuth, adminOrderCtrl.adminCancelOrder);
router.post('/api/orders/:orderId/cancel-items', adminAuth, adminOrderCtrl.adminCancelOrderItems);
router.post('/api/orders/:orderId/refund', adminAuth, adminOrderCtrl.processManualRefund);

// Coupon Management routes
router.get('/coupons', adminAuth, couponCtrl.getCoupons);
router.post('/coupons/create', adminAuth, couponCtrl.createCoupon);
router.get('/coupons/:id', adminAuth, couponCtrl.getCoupon);
router.put('/coupons/:id', adminAuth, couponCtrl.updateCoupon);
router.post('/coupons/:id/toggle', adminAuth, couponCtrl.toggleCouponStatus);
router.delete('/coupons/:id', adminAuth, couponCtrl.deleteCoupon);


// Sales Report routes
router.get('/sales-report', adminAuth, salesReportCtrl.getSalesReportPage);
router.get('/api/sales-report', adminAuth, salesReportCtrl.getSalesReportData);
router.get('/reports/download/excel', adminAuth, salesReportCtrl.downloadExcelReport);
router.get('/reports/download/pdf', adminAuth, salesReportCtrl.downloadPDFReport);

router.put('/api/orders/items/:itemId/return/approve', adminAuth, adminOrderCtrl.approveReturnRequest);
router.put('/api/orders/items/:itemId/return/reject', adminAuth, adminOrderCtrl.rejectReturnRequest);
router.put('/api/return-requests/:returnRequestId/process', adminAuth, adminOrderCtrl.processReturnRequestLegacy);



export default router;