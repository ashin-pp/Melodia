import express from 'express';
const router = express.Router();
import adminCtrl from '../controller/Admin/adminController.js';
import { validateAdminSession, adminAuth } from '../middleware/adminAuth.js';
import customerCtrl from '../controller/Admin/customerController.js';
import productController from '../controller/Admin/productController.js';
import { uploadProductImages } from '../config/multer.js';
import { processImages, processImagesOptional } from '../middleware/imageProcessor.js';
import categoryController from '../controller/Admin/categoryController.js';
import adminOrderCtrl from '../controller/Admin/orderController.js';


router.get('/login', adminCtrl.getLogin);
router.post('/login', adminCtrl.postLogin);

router.use(validateAdminSession)
//protected routes
router.get('/dashboard', adminAuth, adminCtrl.getDashboard);
router.post('/dashboard', adminAuth, adminCtrl.getDashboard);

router.get('/customer', customerCtrl.getUsers)
router.post('/customer/:id/toggle', customerCtrl.toggleBlockStatus);
router.get('/logout', adminAuth, adminCtrl.logout);

router.get('/products', productController.getProducts);
router.get('/products/add', productController.getAddProduct);
router.post('/products/add', uploadProductImages.any(), productController.postAddProduct);
router.get('/products/:id/edit', productController.getEditProduct);
router.post('/products/:id/edit', uploadProductImages.any(), productController.postEditProduct);
router.post('/products/:id/edit-image', uploadProductImages.single('image'), productController.uploadProductImage);


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
router.get('/orders/:orderId', adminAuth, adminOrderCtrl.getAdminOrderDetails);
router.get('/orders/:orderId/invoice', adminAuth, adminOrderCtrl.downloadInvoice);


export default router;