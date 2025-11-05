import User from '../model/userSchema.js';


export const isNotAuthenticated = (req, res, next) => {
  console.log('isNotAuthenticated MIDDLEWARE ');

  res.set({
    'Cache-Control': 'no-cache, no-store, must-revalidate, private',
    'Pragma': 'no-cache',
    'Expires': '0'
  });
  
  if (req.session?.user) {
    console.log('User is already authenticated, redirecting to home...');
    return res.redirect('/home');
  }
  
  console.log('User is not authenticated, proceeding...');
  next();
};



export const checkUserBlocked = async (req, res, next) => {
  try {
    if (req.session && req.session.user) {
      const user = await User.findById(req.session.user.id);
      if (!user || user.isBlocked) {
        const email = req.session.user.email;
        return req.session.destroy((err) => {
          if (err) console.error('Session destroy error:', err);
          return res.render('user/login', {
            error: 'Your account has been blocked. Contact administrator.',
            success: null,
            email,
            query: req.query,
            justRegistered: false,
          });
        });
      }
    }
    return next();
  } catch (err) {
    console.error('Error in checkUserBlocked middleware:', err);
    return res.status(500).render('error/500', { title: 'Server Error' });
  }
};



export default {
  isNotAuthenticated,
  checkUserBlocked,
  
};