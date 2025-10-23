


export const adminAuth = function (req, res, next) {
  
  if (req.session?.admin) {
    console.log(' Admin details:', {
      id: req.session.admin.id,
      email: req.session.admin.email
    });
  }
  
  res.set({
    'Cache-Control': 'no-cache, no-store, must-revalidate, private',
    'Pragma': 'no-cache',
    'Expires': '0'
  });

  if (req.session && req.session.admin) {
    
    return next();
  }

 
  
  if (req.session) {
    req.session.destroy((err) => {
      if (err) console.error('Session destroy error:', err);
      res.redirect('/admin/login');
    });
  } else {
    res.redirect('/admin/login');
  }
};

export const validateAdminSession = function (req, res, next) {
  console.log('=== validateAdminSession MIDDLEWARE ===');

  res.set({
    'Cache-Control': 'no-cache, no-store, must-revalidate, private',
    'Pragma': 'no-cache',
    'Expires': '0'
  });

  // If already logged in and trying to visit login page, go to dashboard
  if (req.path === '/login' && req.session && req.session.admin) {
    return res.redirect('/admin/dashboard');
  }

  // Allow unauthenticated access to login page only
  if (req.path === '/login') {
    return next();
  }

  // If logged in, allow access to all admin routes
  if (req.session && req.session.admin) {
    return next();
  }

  // If not logged in, force login
  return res.redirect('/admin/login');
};
// Default export for compatibility
export default {
  adminAuth,
  validateAdminSession
};