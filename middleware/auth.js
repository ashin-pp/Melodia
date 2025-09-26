// FIXED: Enhanced authentication middleware
exports.isAuthenticated = (req, res, next) => {
  console.log('=== isAuthenticated MIDDLEWARE ===');
  console.log('Session user:', req.session?.user);
  console.log('Request URL:', req.url);
  
  // Set cache control headers to prevent back button issues
  res.set({
    'Cache-Control': 'no-cache, no-store, must-revalidate, private',
    'Pragma': 'no-cache',
    'Expires': '0'
  });
  
  if (!req.session?.user) {
       console.log('User is not authenticated, redirecting to login...');
    return res.redirect('/user/login');
  }
  
  console.log('User is authenticated, proceeding...');
  // Set user data in locals for views
  res.locals.user = req.session.user; 
  next();
};

exports.isNotAuthenticated = (req, res, next) => {
  console.log('=== isNotAuthenticated MIDDLEWARE ===');
  console.log('Session user:', req.session?.user);
  console.log('Request URL:', req.url);
  
  // Set cache control headers to prevent back button issues
  res.set({
    'Cache-Control': 'no-cache, no-store, must-revalidate, private',
    'Pragma': 'no-cache',
    'Expires': '0'
  });
  
  if (req.session?.user) {
    console.log('User is already authenticated, redirecting to home...');
    return res.redirect('/user/home');
  }
  
  console.log('User is not authenticated, proceeding...');
  next();
};

// Admin authentication middleware
exports.isAdmin = (req, res, next) => {
  console.log('=== isAdmin MIDDLEWARE ===');
  console.log('Session user:', req.session?.user);
  
  // Set cache control headers
  res.set({
    'Cache-Control': 'no-cache, no-store, must-revalidate, private',
    'Pragma': 'no-cache',
    'Expires': '0'
  });
  
  if (!req.session?.user) {
    console.log('No user session, redirecting to login...');
    return res.redirect('/user/login');
  }
  
  if (req.session.user.role !== 'admin' && !req.session.user.isAdmin) {
    console.log('User is not admin, access denied...');
    return res.status(403).render('error/403', { 
      title: 'Access Denied',
      message: 'You do not have permission to access this page.'
    });
  }
  
  console.log('User is admin, proceeding...');
  res.locals.user = req.session.user;
  next();
};

exports.checkUserBlocked = async (req, res, next) => {
  try {
    if (req.session && req.session.user) {
      const user = await User.findOne({ email: req.session.user.email });
      if (!user || user.isBlocked) {
        const email = req.session.user.email;
        req.session.user = null;
        return res.render('user/login', {
          message: "Your account has been blocked by admin.",
          isError: true,
          oldInput: { email },
        });
      }
    }
    next();
  } catch (err) {
    console.error('Error in checkUserBlocked middleware:', err);
    res.status(500).render('error/500', { title: 'Server Error' });
  }
};


// FIXED: Session validation middleware (optional, use only when needed)
exports.validateUserSession = (req, res, next) => {
  console.log('=== validateUserSession MIDDLEWARE ===');
  
  // Set cache control headers
  res.set({
    'Cache-Control': 'no-cache, no-store, must-revalidate, private',
    'Pragma': 'no-cache',
    'Expires': '0'
  });
  
  // Check if session exists and is valid
  if (req.session?.user) {
    // FIXED: Proper session timeout check
    if (req.session.cookie.expires && new Date() > req.session.cookie.expires) {
      console.log('Session expired, destroying...');
      req.session.destroy((err) => {
        if (err) console.error('Session destroy error:', err);
        return res.redirect('/user/login');
      });
      return;
    }
    
    // Refresh session
    req.session.touch();
    res.locals.user = req.session.user;
  }
  
  next();
};




