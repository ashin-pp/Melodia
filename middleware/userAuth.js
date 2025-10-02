const { checkUserBlocked } = require('./auth');

// Ensures the user is logged in and not blocked before accessing protected routes
exports.protectUser = async (req, res, next) => {
  try {
    // Strong cache prevention for authenticated pages
    res.set({
      'Cache-Control': 'no-cache, no-store, must-revalidate, private',
      'Pragma': 'no-cache',
      'Expires': '0'
    });

    // Validate session
    if (!req.session || !req.session.user) {
      return res.redirect('/user/login');
    }

    // Expose user to views
    res.locals.user = req.session.user;

    // Ensure the account isn't blocked
    return checkUserBlocked(req, res, next);
  } catch (err) {
    console.error('Error in protectUser middleware:', err);
    return res.status(500).render('error/500', { title: 'Server Error' });
  }
};
