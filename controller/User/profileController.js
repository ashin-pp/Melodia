const mongoose = require('mongoose');
const User = require('../../model/userSchema');
const bcrypt = require('bcryptjs');
const sendMail = require('../../helper/mailer');
const cloudinary = require('../../config/cloudinary');
const Address=require('../../model/addressSchema');

exports.getProfile = async (req, res) => {
  if (!req.session) return res.redirect('/login');
  const userId = req.session.user.id;
  if (!userId) return res.redirect('/login');
  
  const user = await User.findById(userId);
  if (!user) {
    delete req.session.user;
    return res.redirect('/login');
  }
  
  res.render('user/profile', { user });
};

exports.logout = (req, res) => {
  if (!req.session.user) return res.redirect('/login');
  
  req.session.user = null;
  delete req.session.user;
  delete req.session.otp;
  delete req.session.signupData;
  delete req.session.resetToken;
  
  req.session.save((err) => {
    if (err) {
      console.error('Error saving session during logout:', err);
      return res.render('error/500', { title: 'Server Error' });
    }
    res.redirect('/login');
  });
};

exports.getEditProfile = async (req, res) => {
  if (!req.session) return res.redirect('/login');
  const userId = req.session.user.id;
  if (!userId) return res.redirect('/login');
  
  const user = await User.findById(userId);
  if (!user) {
    delete req.session.user;
    return res.redirect('/login');
  }
  
  res.render('user/edit-profile', { user });
};

exports.postEditProfile = async (req, res) => {
  if (!req.session) return res.redirect('/login');
  const userId = req.session.user.id;
  if (!userId) return res.redirect('/login');
  
  const { name, phone } = req.body;
  
  const updatedUser = await User.findByIdAndUpdate(
    userId,
    { name, phone },
    { new: true }
  );
  
  if (!updatedUser) {
    delete req.session.user;
    return res.redirect('/login');
  }
  
  req.session.user.name = updatedUser.name;
  res.redirect('/profile?success=Profile updated successfully');
};

exports.uploadAvatar = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: "No file uploaded"
      });
    }
    
    const uploadToCloudinary = (fileBuffer) => {
      return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream({
          folder: 'user-avatars',
          transformation: [
            { width: 300, height: 300, crop: 'fill' },
            { quality: 'auto', fetch_format: 'auto' }
          ]
        }, (error, result) => {
          if (error) return reject(error);
          resolve(result);
        });
        stream.end(fileBuffer);
      });
    };
    
    const result = await uploadToCloudinary(req.file.buffer);
    const user = await User.findById(req.session.user.id);
    
    if (user.avatar && user.avatar.publicId) {
      await cloudinary.uploader.destroy(user.avatar.publicId);
    }
    
    user.avatar = {
      url: result.secure_url,
      publicId: result.public_id
    };
    await user.save();
    
    res.json({
      success: true,
      message: 'Profile picture updated successfully',
      avatar: user.avatar
    });
  } catch (error) {
    console.error("Avatar upload error:", error);
    res.json({ success: false, message: 'Server error occurred. Please try again.' });
  }
};

exports.deleteAvatar = async (req, res) => {
  try {
    const user = await User.findById(req.session.user.id);
    if (!user) return res.json({ success: false, message: 'User not found' });
    
    if (!user.avatar || !user.avatar.url) {
      return res.json({ success: false, message: 'No profile picture to remove' });
    }
    
    if (user.avatar.publicId) {
      try {
        await cloudinary.uploader.destroy(user.avatar.publicId);
      } catch (cloudinaryError) {
        console.error("Error deleting from cloudinary:", cloudinaryError);
      }
    }
    
    const updatedUser = await User.findByIdAndUpdate(
      req.session.user.id,
      { $unset: { avatar: "" } },
      { new: true }
    );
    
    if (!updatedUser) {
      return res.json({ success: false, message: 'Failed to remove avatar' });
    }
    
    res.json({ success: true, message: 'Profile picture removed successfully' });
  } catch (error) {
    console.error("Error in deleteAvatar:", error);
    res.json({ success: false, message: 'Server error occurred. Please try again.' });
  }
};

exports.sendEmailOTP = async (req, res) => {
  try {
    if (!req.session) return res.json({ success: false, message: 'Session not found' });
    
    const userId = req.session.user.id;
    if (!userId) return res.json({ success: false, message: 'User not found in session' });
    
    const { newEmail } = req.body;
    if (!newEmail) return res.json({ success: false, message: 'Email address is required' });
    
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newEmail)) {
      return res.json({ success: false, message: 'Please enter a valid email address' });
    }
    
    const user = await User.findById(userId);
    if (!user) {
      delete req.session.user;
      return res.json({ success: false, message: 'User not found' });
    }
    
    const existingUser = await User.findOne({ email: newEmail, _id: { $ne: userId } });
    if (existingUser) {
      return res.json({ success: false, message: 'This email address is already in use' });
    }
    
    if (user.email === newEmail) {
      return res.json({ success: false, message: 'This is already your current email address' });
    }
    
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    
    req.session.emailChangeOTP = {
      code: otp,
      newEmail: newEmail,
      userId: userId,
      expires: Date.now() + 5 * 60 * 1000, // 5 minutes
    };
    
    await sendMail(
      newEmail,
      'Email Change Verification - Melodia',
      `Your OTP for email change is: ${otp}`,
      `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #ff6b6b;">Email Change Verification</h2>
        <p>Your verification code is:</p>
        <div style="background: #f8f9fa; padding: 20px; text-align: center; border-radius: 10px; margin: 20px 0;">
          <h1 style="color: #ff6b6b; font-size: 32px; margin: 0; letter-spacing: 5px;">${otp}</h1>
        </div>
        <p>This code will expire in 5 minutes.</p>
      </div>`
    );
    
    res.json({ success: true, message: 'OTP sent successfully' });
  } catch (error) {
    console.error("Error in sendEmailOTP:", error);
    res.json({ success: false, message: 'Server error occurred. Please try again.' });
  }
};

exports.verifyEmailOTP = async (req, res) => {
  try {
    if (!req.session) return res.json({ success: false, message: 'Session not found' });
    
    const { newEmail, otp } = req.body;
    
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
    
    const updatedUser = await User.findByIdAndUpdate(
      otpData.userId,
      { email: newEmail },
      { new: true }
    );
    
    if (!updatedUser) {
      return res.json({ success: false, message: 'Failed to update email' });
    }
    
    req.session.user.email = updatedUser.email;
    delete req.session.emailChangeOTP;
    
    res.json({ success: true, message: 'Email address updated successfully' });
  } catch (error) {
    console.error("Error in verifyEmailOTP:", error);
    res.json({ success: false, message: 'Server error occurred. Please try again.' });
  }
};

exports.resendEmailOTP = async (req, res) => {
  try {
    if (!req.session) return res.json({ success: false, message: 'Session not found' });
    
    const userId = req.session.user.id;
    if (!userId) return res.json({ success: false, message: 'User not found in session' });
    
    const { newEmail } = req.body;
    
    if (!req.session.emailChangeOTP) {
      return res.json({ success: false, message: 'No active email change session found. Please start the process again.' });
    }
    
    if (req.session.emailChangeOTP.newEmail !== newEmail) {
      return res.json({ success: false, message: 'Email mismatch. Please start the process again.' });
    }
    
    const lastOtpTime = req.session.emailChangeOTP.lastSent || 0;
    const currentTime = Date.now();
    const timeDiff = currentTime - lastOtpTime;
    const minInterval = 60 * 1000; // 1 minute
    
    if (timeDiff < minInterval) {
      const remainingTime = Math.ceil((minInterval - timeDiff) / 1000);
      return res.json({
        success: false,
        message: `Please wait ${remainingTime} seconds before requesting another OTP`
      });
    }
    
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    
    req.session.emailChangeOTP = {
      ...req.session.emailChangeOTP,
      code: otp,
      expires: Date.now() + 5 * 60 * 1000, // 5 minutes
      lastSent: currentTime
    };
    
    await sendMail(
      newEmail,
      'Email Change Verification - Melodia (Resent)',
      `Your new OTP for email change is: ${otp}`,
      `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #ff6b6b;">Email Change Verification - Resent</h2>
        <p>Your new verification code is:</p>
        <div style="background: #f8f9fa; padding: 20px; text-align: center; border-radius: 10px; margin: 20px 0;">
          <h1 style="color: #ff6b6b; font-size: 32px; margin: 0; letter-spacing: 5px;">${otp}</h1>
        </div>
        <p>This code will expire in 5 minutes.</p>
      </div>`
    );
    
    res.json({ success: true, message: 'New OTP sent successfully' });
  } catch (error) {
    console.error("Error in resendEmailOTP:", error);
    res.json({ success: false, message: 'Server error occurred. Please try again.' });
  }
};

exports.getChangePassword= async (req,res)=>{
  if(!req.session){
    return res.redirect('/login');
  }
  const userId=req.session.user.id;
  if(!userId) return res.redirect('/login');

  const user=await User.findById(userId);
  if(!user){
    delete req.session.user;
    return res.redirect('/login')
  }
  res.render('user/change-password',{user});
};


exports.ChangePassword=async (req,res)=>{
  try{
  if(!req.session) return res.json({success:false,message:"session not found"});

  const userId=req.session.user.id;
  const {currentPassword,newPassword,confirmPassword}=req.body;
  
  if(!currentPassword||!newPassword||!confirmPassword){
    return res.json({success:false,message:"all fields arer require"});
  }
  if(newPassword!==confirmPassword){
    return res.json({success:false,message:"new password do not natch"})
  }

  if(newPassword.length<6){
     return res.json({ success: false, message: 'Password must be at least 6 characters long' });
  }

  const user=await User.findById(userId);
  if(!user) return res.json({success:false,message:"User not found"});

   const passwordMatches=await bcrypt.compare(currentPassword,user.password);

   if(!passwordMatches){
     return res.json({ success: false, message: 'Current password is incorrect' });
   }
   user.password=await bcrypt.hash(newPassword,10);
   await user.save();
    res.json({ success: true, message: 'Password changed successfully' });
  
}
   catch (error) {
    console.error("Error in changePassword:", error);
    res.json({ success: false, message: 'Server error occurred. Please try again.' });
  }
}


exports.getAddresses=async (req,res)=>{
  if(!req.session) return res.redirect('/login');
  const userId=req.session.user.id;
  if(!userId) return res.redirect('/login');
  const user=await User.findById(userId);
  if(!user){
    delete req.session.user;
    return res.redirect('/login')
  }
  const addresses = await Address.find({ userId }).sort({ createdAt: -1 });
  res.render('user/addresses', { user, addresses });
}

exports.addAddress = async (req, res) => {
  try {
    if (!req.session) return res.json({ success: false, message: 'Session not found' });
    
    const { fullName, email, phoneNo, address, city, state, pinCode, addressType, landmark } = req.body;
    const userId = req.session.user.id;
    
    if (!fullName || !email || !phoneNo || !address || !city || !state || !pinCode) {
      return res.json({ success: false, message: 'All required fields must be filled' });
    }
    
    const newAddress = new Address({
      userId,
      fullName,
      email,
      phoneNo: Number(phoneNo),
      address,
      city,
      state,
      pinCode: Number(pinCode),
      addressType: addressType || 'HOME',
      landmark: landmark || ''
    });
    
    await newAddress.save();
    res.json({ success: true, message: 'Address added successfully' });
  } catch (error) {
    console.error("Error in addAddress:", error);
    res.json({ success: false, message: 'Server error occurred. Please try again.' });
  }
};

exports.editAddress = async (req, res) => {
  try {
    if (!req.session) return res.json({ success: false, message: 'Session not found' });
    
    const { addressId } = req.params;
    const { fullName, email, phoneNo, address, city, state, pinCode, addressType, landmark } = req.body;
    const userId = req.session.user.id;
    
    if (!fullName || !email || !phoneNo || !address || !city || !state || !pinCode) {
      return res.json({ success: false, message: 'All required fields must be filled' });
    }
    
    const addressDoc = await Address.findOne({ _id: addressId, userId });
    if (!addressDoc) {
      return res.json({ success: false, message: 'Address not found' });
    }
    
    addressDoc.fullName = fullName;
    addressDoc.email = email;
    addressDoc.phoneNo = Number(phoneNo);
    addressDoc.address = address;
    addressDoc.city = city;
    addressDoc.state = state;
    addressDoc.pinCode = Number(pinCode);
    addressDoc.addressType = addressType || 'HOME';
    addressDoc.landmark = landmark || '';
    
    await addressDoc.save();
    res.json({ success: true, message: 'Address updated successfully' });
  } catch (error) {
    console.error("Error in editAddress:", error);
    res.json({ success: false, message: 'Server error occurred. Please try again.' });
  }
};

exports.deleteAddress = async (req, res) => {
  try {
    if (!req.session) return res.json({ success: false, message: 'Session not found' });
    
    const { addressId } = req.params;
    const userId = req.session.user.id;
    
    const address = await Address.findOne({ _id: addressId, userId });
    if (!address) {
      return res.json({ success: false, message: 'Address not found' });
    }
    
    await Address.findByIdAndDelete(addressId);
    res.json({ success: true, message: 'Address deleted successfully' });
  } catch (error) {
    console.error("Error in deleteAddress:", error);
    res.json({ success: false, message: 'Server error occurred. Please try again.' });
  }
};



