
const mongoose = require('mongoose')
const User = require('../../model/userSchema');
const { log } = require('util');
 const sendMail = require('../../helper/mailer');



exports.getProfile = async (req,res)=>{
  try {
    if(!req.session){
        console.log("session not found")
        return res.redirect('/login')
    }
   const userId = req.session.user.id 
   if(!userId){
    console.log("the user id not found in the session ")
    return res.redirect('/login')
   }

   const user = await User.findById(userId)
   if(!user){
    console.log("user not found ")
    delete req.session.user;
    return res.redirect('/login')
   }
   
   console.log("Rendering profile for user:", user.name || user.email)
   res.render('user/profile', { user })
   
  } catch (error) {
    console.error("Error in getProfile:", error)
    res.status(500).render('error/500', { title: 'Server Error' })
  }
};

exports.getEditProfile=async (req,res)=>{
  try{
    if(!req.session){
      console.log("session not found");
      return res.redirect('/login');
    }
    const userId=req.session.user.id;
    if(!userId){
      console.log("user id is not found in the session ");
      return res.redirect('/login');
    }
    const user=await User.findById(userId);
    if(!user){
      console.log("user is not found");
      delete req.session.user;
      return res.redirect('/login')
    }
    console.log('rendering edit profile page');
    res.render('user/edit-profile',{user})
  }
  catch(err){
    console.log("error in getEdit profile ",err);
    req.status(500).render('error/500',{tittle:'server error'});
  }
}


exports.postEditProfile=async (req,res)=>{
  
  
  try{
    if(!req.session){
      console.log("session is not found");
      return res.redirect('/login');
    }
    const userId=req.session.user.id;
    if(!userId){
      console.log("user id is not found in the session");
      return res.redirect('/login');
    }
    
    const {name,phone}=req.body;
    //update user in database
    const updatedUser=await User.findByIdAndUpdate(
      userId,
      {name,phone},
      {new:true}
    );

    if(!updatedUser){
      console.log("user is not found");
      delete req.session.user;
      return res.redirect('/login');
    }

    req.session.user.name=updatedUser.name;
    console.log("profile updat success");
    res.redirect('/profile?success=profile updated successfully');


  }
  catch(err){
    console.log('error in post edit profile',err);
    res.redirect('/profile/edit?error=failed to update profile')
  }
};

exports.sendEmailOTP = async (req, res) => {
  console.log("entering send otp route")
  console.log("Request body:", req.body)
  try {
    if (!req.session) {
      return res.json({ success: false, message: 'Session not found' });
    }
    
    const userId = req.session.user.id;
    if (!userId) {
      return res.json({ success: false, message: 'User not found in session' });
    }

    const { newEmail } = req.body;

    // Validation
    if (!newEmail) {
      return res.json({ success: false, message: 'Email address is required' });
    }
    

    // Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newEmail)) {
      return res.json({ success: false, message: 'Please enter a valid email address' });
    }

    // Find user
    const user = await User.findById(userId);
    if (!user) {
      delete req.session.user;
      return res.json({ success: false, message: 'User not found' });
    }

    // Check if new email already exists
    const existingUser = await User.findOne({ email: newEmail, _id: { $ne: userId } });
    if (existingUser) {
      // If the existing user has a Google ID, provide more specific error message
      if (existingUser.googleId) {
        return res.json({ 
          success: false, 
          message: 'This email address is already linked to a Google account. Please use a different email or login with Google.' 
        });
      }
      return res.json({ success: false, message: 'This email address is already in use' });
    }

    // Check if it's the same as current email
    if (user.email === newEmail) {
      return res.json({ success: false, message: 'This is already your current email address' });
    }

    // Generate OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Store OTP in session
    req.session.emailChangeOTP = {
      code: otp,
      newEmail: newEmail,
      userId: userId,
      expires: Date.now() + 5 * 60 * 1000, // 5 minutes
    };

    // Send OTP email
    console.log("Attempting to send email to:", newEmail)
    await sendMail(
      newEmail,
      'Email Change Verification - Melodia',
      `Your OTP for email change is: ${otp}`,
      `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #ff6b6b;">Email Change Verification</h2>
        <p>You have requested to change your email address on Melodia.</p>
        <p>Your verification code is:</p>
        <div style="background: #f8f9fa; padding: 20px; text-align: center; border-radius: 10px; margin: 20px 0;">
          <h1 style="color: #ff6b6b; font-size: 32px; margin: 0; letter-spacing: 5px;">${otp}</h1>
        </div>
        <p>This code will expire in 5 minutes.</p>
        <p>If you didn't request this change, please ignore this email.</p>
      </div>
      `
    );
    console.log("Email sent successfully");

    console.log('Email change OTP sent to:', newEmail);
    res.json({ success: true, message: 'OTP sent successfully' });

  } catch (error) {
    console.error("Error in sendEmailOTP:", error);
    res.json({ success: false, message: 'Server error occurred. Please try again.' });
  }
};

exports.verifyEmailOTP = async (req, res) => {
  try {
    if (!req.session) {
      return res.json({ success: false, message: 'Session not found' });
    }

    const { newEmail, otp } = req.body;

    // Validate OTP session data
    if (!req.session.emailChangeOTP) {
      return res.json({ success: false, message: 'OTP session expired. Please request a new OTP.' });
    }

    const otpData = req.session.emailChangeOTP;

    if (otpData.newEmail !== newEmail) {
      return res.json({ success: false, message: 'Invalid session. Please try again.' });
    }

    if (otpData.code !== otp) {
      return res.json({ success: false, message: 'Invalid OTP. Please try again.' });
    }

    if (otpData.expires < Date.now()) {
      delete req.session.emailChangeOTP;
      return res.json({ success: false, message: 'OTP has expired. Please request a new one.' });
    }

    // Update email in database
    const updatedUser = await User.findByIdAndUpdate(
      otpData.userId,
      { email: newEmail },
      { new: true }
    );

    if (!updatedUser) {
      return res.json({ success: false, message: 'Failed to update email' });
    }

    // Update session with new email
    req.session.user.email = updatedUser.email;
  
    // Clean up OTP session data
    delete req.session.emailChangeOTP;

    console.log("Email updated for user:", updatedUser.name);
    res.json({ success: true, message: 'Email address updated successfully' });

  } catch (error) {
    console.error("Error in verifyEmailOTP:", error);
    res.json({ success: false, message: 'Server error occurred. Please try again.' });
  }
};

  exports.logout = (req, res) => {
  try {
    // Check if user is logged in
    if (!req.session.user) {
      return res.redirect('/login');
    }

  
    req.session.user = null;
    delete req.session.user;


    delete req.session.otp;
    delete req.session.signupData;
    delete req.session.resetToken;

    // Save session to persist the changes
    req.session.save((err) => {
      if (err) {
        console.error('Error saving session during logout:', err);
        return res.render('error/500', { title: 'Server Error' });
      }
      
      res.redirect('/login');
    });

  } catch (err) {
    console.error('Error in logout:', err);
    res.render('error/500', { title: 'Server Error' });
  }
};