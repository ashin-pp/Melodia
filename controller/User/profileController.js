const mongoose = require('mongoose')
const User = require('../../model/userSchema')


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