const User=require('../model/userSchema');


const isAuthenticated = (req, res, next) => {
  try {
    if (req.session && req.session.user){
      
      return next();
    } else {
      
      return res.redirect('/user/login');
    }
  } catch (err) {
    console.error('Error in isAuthenticated middleware:', err);
    res.status(500).render('error/500', { title: 'Server Error' });
  }
};

// Middleware to check if user is NOT authenticated
const isNotAuthenticated = (req, res, next) => {
  try {
   
    if (!req.session.user) {

      return next();
    }

    res.redirect('/');
  } catch (err) {
    console.error('Error in isNotAuthenticated middleware:', err);
    res.status(500).render('error/500', { title: 'Server Error' });
  }
};

module.exports={ isAuthenticated, isNotAuthenticated };