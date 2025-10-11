const express = require('express');
const router = express.Router();
const adminCtrl = require('../controller/Admin/adminController');
const { validateAdminSession, adminAuth } = require('../middleware/adminAuth');
const customerCtrl = require('../controller/Admin/customerController')
const productController = require('../controller/Admin/productController');
const { uploadProductImages } = require('../config/multer');
const { processImages, processImagesOptional } = require('../middleware/imageProcessor');
const categoryController = require("../controller/Admin/categoryController");

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


module.exports = router;