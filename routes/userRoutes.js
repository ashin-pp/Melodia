

const express = require('express');
const router = express.Router();
const passport = require('passport');
const userCtrl = require('../controller/User/userController');
const { isNotAuthenticated } = require('../middleware/auth');
const profileCtrl = require('../controller/User/profileController');
const productCtrl = require('../controller/User/productController')
const categoryCtrl = require('../controller/User/categoryController')
const cartCtrl = require('../controller/User/cartController');
const wishlistCtrl = require('../controller/User/wishlistController');
const addressCtrl = require('../controller/User/addressController');
const checkoutCtrl = require('../controller/User/checkoutController');
const { protectUser } = require('../middleware/userAuth');
const { avatarUpload } = require('../config/multer');

//landing page route
router.get('/', (req, res) => {
  // If admin is logged in, always go to admin dashboard
  if (req.session?.admin) {
    return res.redirect('/admin/dashboard');
  }
  if (req.session?.user) {
    return res.redirect('/home');
  } else { // Otherwise, show landing page
    return userCtrl.loadLandingPage(req, res);
  }
});

//signup routes
router.get('/signUp', isNotAuthenticated, userCtrl.getSignup);
router.post('/signUp', isNotAuthenticated, userCtrl.postSignup);

//login routes
router.get('/login', isNotAuthenticated, userCtrl.getLogin);
router.post('/login', isNotAuthenticated, userCtrl.postLogin);

// otp routes
router.post('/verify-otp', isNotAuthenticated, userCtrl.verifyOtp);
router.post('/resend-otp', isNotAuthenticated, userCtrl.resendOtp);

// Forgot/Reset Password Routes
router.get('/forgot-password', isNotAuthenticated, userCtrl.getForgotPassword);
router.post('/forgot-password', isNotAuthenticated, userCtrl.postForgotPassword);
router.get('/reset-password/:token', isNotAuthenticated, userCtrl.getResetPassword);
router.post('/reset-password/:token', isNotAuthenticated, userCtrl.postResetPassword);



// Google OAuth routes
router.get(
  '/auth/google',
  isNotAuthenticated,
  passport.authenticate('google', { scope: ['profile', 'email'], prompt: 'select_account' })
);
router.get(
  '/auth/google/callback',
  isNotAuthenticated,
  passport.authenticate('google', { failureRedirect: '/login' }),
  userCtrl.googleCallback
);

// Protected routes
router.get('/home', protectUser, userCtrl.loadHomePage);
router.get('/logout', protectUser, profileCtrl.logout);

// Profile routes
router.get('/profile', protectUser, profileCtrl.getProfile);
router.get('/profile/edit', protectUser, profileCtrl.getEditProfile);
router.post('/profile/edit', protectUser, profileCtrl.postEditProfile);
router.post('/profile/send-email-otp', protectUser, profileCtrl.sendEmailOTP);
router.post('/profile/resend-email-otp', protectUser, profileCtrl.resendEmailOTP);
router.post('/profile/verify-email-otp', protectUser, profileCtrl.verifyEmailOTP);
router.post('/profile/upload-avatar', protectUser, avatarUpload, profileCtrl.uploadAvatar);
router.delete('/profile/delete-avatar', protectUser, profileCtrl.deleteAvatar);

//password routes
router.get('/password', protectUser, profileCtrl.getChangePassword);
router.post('/password/change', protectUser, profileCtrl.ChangePassword);


// Product & Category routes
router.get('/product/list',protectUser, productCtrl.getShop);
router.get('/products/:id',protectUser, productCtrl.getProductDetails);
router.get('/products/variants/:variantId',protectUser, productCtrl.getVariantDetails);
router.get('/categories/:id',protectUser, categoryCtrl.getCategoryPage);
router.get('/categories',protectUser, categoryCtrl.getCategoriesPage);

// Cart routes
router.get('/cart', protectUser, cartCtrl.getCart);
router.post('/cart/add', protectUser, cartCtrl.addToCart);
router.put('/cart/update', protectUser, cartCtrl.updateCartQuantity);
router.delete('/cart/remove', protectUser, cartCtrl.removeFromCart);
router.delete('/cart/clear', protectUser, cartCtrl.clearCart);
router.get('/cart/count', protectUser, cartCtrl.getCartCount);

// Wishlist routes
router.get('/wishlist', protectUser, wishlistCtrl.getWishlist);
router.post('/wishlist/add', protectUser, wishlistCtrl.addToWishlist);
router.delete('/wishlist/remove', protectUser, wishlistCtrl.removeFromWishlist);
router.post('/wishlist/move-to-cart', protectUser, wishlistCtrl.moveToCart);
router.get('/wishlist/count', protectUser, wishlistCtrl.getWishlistCount);

// Address routes
router.get('/addresses', protectUser, addressCtrl.renderAddressesPage);
router.get('/api/addresses', protectUser, addressCtrl.getAddresses);
router.post('/addresses', protectUser, addressCtrl.addAddress);
router.put('/addresses/:id', protectUser, addressCtrl.updateAddress);
router.delete('/addresses/:id', protectUser, addressCtrl.deleteAddress);
router.put('/addresses/:id/default', protectUser, addressCtrl.setDefaultAddress);

// Checkout routes
router.get('/checkout', protectUser, checkoutCtrl.getCheckout);
router.post('/checkout/place-order', protectUser, checkoutCtrl.placeOrder);
router.get('/order-success/:orderId', protectUser, checkoutCtrl.orderSuccess);





module.exports = router;