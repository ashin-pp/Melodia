const express = require('express');
const router = express.Router();
const passport = require('passport');
const userCtrl = require('../controller/User/userController');
const { isNotAuthenticated } = require('../middleware/auth');
const profileCtrl = require('../controller/User/profileController');
const productCtrl = require('../controller/User/productController')
const categoryCtrl = require('../controller/User/categoryController')
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


// Product & Category routes
router.get('/product/list', protectUser, productCtrl.getShop);
router.get('/products/:id', protectUser, productCtrl.getProductDetails);
router.get('/products/variants/:variantId', protectUser, productCtrl.getVariantDetails);
router.get('/categories/:id', protectUser, categoryCtrl.getCategoryPage);
router.get('/categories', protectUser, categoryCtrl.getCategoriesPage);



// Forgot/Reset Password Routes
router.get('/forgot-password', isNotAuthenticated, userCtrl.getForgotPassword);
router.post('/forgot-password', isNotAuthenticated, userCtrl.postForgotPassword);
router.get('/reset-password/:token', isNotAuthenticated, userCtrl.getResetPassword);
router.post('/reset-password/:token', isNotAuthenticated, userCtrl.postResetPassword);

module.exports = router;