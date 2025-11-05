import express from 'express';
import passport from 'passport';
import userCtrl from '../controller/User/userController.js';
import { isNotAuthenticated } from '../middleware/auth.js';
import profileCtrl from '../controller/User/profileController.js';
import productCtrl from '../controller/User/productController.js';
import categoryCtrl from '../controller/User/categoryController.js';
import cartCtrl from '../controller/User/cartController.js';
import wishlistCtrl from '../controller/User/wishlistController.js';
import addressCtrl from '../controller/User/addressController.js';
import checkoutCtrl from '../controller/User/checkoutController.js';
import { protectUser } from '../middleware/userAuth.js';
import orderCtrl from '../controller/User/orderController.js';
import { avatarUpload } from '../config/multer.js';
import paymentCtrl from '../controller/User/paymentController.js';
import couponCtrl from '../controller/User/couponController.js';
import walletCtrl from '../controller/User/walletController.js';
import referralService from '../services/referralService.js';

const router = express.Router();

//landing page route
router.get('/', (req, res) => {
  if (req.session?.admin) {
    return res.redirect('/admin/dashboard');
  }
  if (req.session?.user) {
    return res.redirect('/home');
  } else { 
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
  passport.authenticate('google', { failureRedirect: '/login?error=google_auth_failed' }),
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


// About page route
router.get('/about', userCtrl.loadAboutPage);

//Contact page route
router.get('/contact',userCtrl.getContact);
router.post('/contact',userCtrl.postContact);

// Product & Category routes
router.get('/product/list', productCtrl.getShop);
router.get('/products/:id', productCtrl.getProductDetails);
router.get('/products/variants/:variantId', productCtrl.getVariantDetails);
router.get('/api/variant/:variantId', productCtrl.getVariantAPI);
router.get('/categories/:id', categoryCtrl.getCategoryPage);
router.get('/categories', categoryCtrl.getCategoriesPage);

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
router.get('/wishlist/check/:variantId', protectUser, wishlistCtrl.checkWishlistItem);

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
router.post('/checkout/complete-razorpay', protectUser, checkoutCtrl.completeRazorpayOrder);
router.get('/order-success/:orderId', protectUser, checkoutCtrl.orderSuccess);

// Order Management routes
router.get('/orders', protectUser, orderCtrl.getOrders);
router.get('/orders/:orderId', protectUser, orderCtrl.getOrderDetails);
router.post('/orders/:orderId/cancel', protectUser, orderCtrl.cancelOrder);
router.post('/orders/:orderId/cancel-items', protectUser, orderCtrl.cancelOrderItems);
router.post('/orders/:orderId/return', protectUser, orderCtrl.returnOrder);
router.post('/orders/:orderId/return-item', protectUser, orderCtrl.returnOrderItem);
router.get('/orders/:orderId/invoice', protectUser, orderCtrl.downloadInvoice);

// Payment routes
router.post('/payment/create-order', protectUser, paymentCtrl.createRazorpayOrder);
router.post('/payment/verify', protectUser, paymentCtrl.verifyPayment);
router.post('/payment/failure', protectUser, paymentCtrl.handlePaymentFailure);
router.post('/payment/wallet', protectUser, paymentCtrl.processWalletPayment);

// Payment result pages
router.get('/payment/success/:orderId', protectUser, orderCtrl.getPaymentSuccess);
router.get('/payment/failure/:orderId', protectUser, orderCtrl.getPaymentFailure);

// Coupon routes
router.post('/coupons/apply', protectUser, couponCtrl.applyCoupon);
router.post('/coupons/remove', protectUser, couponCtrl.removeCoupon);
router.get('/coupons/available', protectUser, couponCtrl.getAvailableCoupons);

// Wallet routes
router.get('/wallet', protectUser, walletCtrl.getWalletPage);
router.get('/api/wallet/balance', protectUser, walletCtrl.getWalletBalance);
router.get('/api/wallet/transactions', protectUser, walletCtrl.getTransactionHistory);
router.post('/api/wallet/validate-payment', protectUser, walletCtrl.validateWalletPayment);

// Referral routes 
router.get('/api/referral/stats', protectUser, walletCtrl.getReferralStats);
router.post('/api/referral/validate', async (req, res) => {
  try {
    const { referralCode } = req.body;

    if (!referralCode || referralCode.trim().length === 0) {
      return res.json({ valid: false, message: 'Referral code is required' });
    }

    const result = await referralService.validateReferralCode(referralCode.trim());
    res.json(result);
  } catch (error) {
    console.error('Referral validation error:', error);
    res.status(500).json({ valid: false, message: 'Validation failed' });
  }
});





export default router;