const express = require('express');
const router = express.Router();
const passport=require('passport');
const userCtrl = require('../controller/User/userController');
const {isNotAuthenticated,isAuthenticated}=require('../middleware/auth');
const profileCtrl=require('../controller/User/profileController');
const {validateUserSession}=require('../middleware/auth');
//landing page route
router.get('/', (req, res) => {
  // If admin is logged in, always go to admin dashboard
  if (req.session?.admin) {
    return res.redirect('/admin/dashboard');
  }
  if (req.session?.user) {
    return res.redirect('/user/home');
  } else {
    return userCtrl.loadLandingPage(req, res);
  }
});

//signup routes
router.get('/signUp',isNotAuthenticated,userCtrl.getSignup);
router.post('/signUp',isNotAuthenticated,userCtrl.postSignup);

//login routes
router.get('/login',isNotAuthenticated, userCtrl.getLogin);
router.post('/login',isNotAuthenticated,userCtrl.postLogin);

// otp routes
router.post('/verify-otp',isNotAuthenticated,userCtrl.verifyOtp);
router.post('/resend-otp',isNotAuthenticated,userCtrl.resendOtp);

// Google OAuth routes (SSO)
router.get(
  '/auth/google',isNotAuthenticated,
  passport.authenticate('google', { scope: ['profile', 'email'],prompt: 'select_account' })
);
router.get(
  '/auth/google/callback',isNotAuthenticated,
  passport.authenticate('google', { failureRedirect:'/user/login'}),
userCtrl.googleCallback
);

router.use(validateUserSession);
//protected routes
router.get('/user/home', isAuthenticated, userCtrl.loadHomePage); 
router.get('/logout', isAuthenticated, profileCtrl.logout);
router.get('/profile',isAuthenticated,profileCtrl.getProfile);


module.exports=router;