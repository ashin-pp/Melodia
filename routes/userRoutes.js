const express = require('express');
const router = express.Router();
const userCtrl = require('../controller/User/userController');
const {isNotAuthenticated,isAuthenticated}=require('../middleware/auth');



router.get('/', userCtrl.loadLandingPage);

//signup routes
router.get('/signUp',isNotAuthenticated,userCtrl.getSignup);
router.post('/signUp',isNotAuthenticated,userCtrl.postSignup);

//login routes
router.get('/login',isNotAuthenticated, userCtrl.getLogin);
router.post('/login',isNotAuthenticated,userCtrl.postLogin)

// otp routes
router.post('/verify-otp',isNotAuthenticated,userCtrl.verifyOtp);
router.post('/resend-otp',isNotAuthenticated,userCtrl.resendOtp);

router.get('/user/home', isAuthenticated, (req, res) => {
  res.render('user/home');
});


module.exports=router;