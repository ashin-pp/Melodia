import { checkUserBlocked } from './auth.js';

export const protectUser = async (req, res, next) => {
  try {
    res.set({
      'Cache-Control': 'no-cache, no-store, must-revalidate, private',
      'Pragma': 'no-cache',
      'Expires': '0',
      'X-Frame-Options': 'DENY',
      'X-Content-Type-Options': 'nosniff'
    });

    if (!req.session || !req.session.user) {
      return res.redirect('/login');
    }

    res.locals.user = req.session.user;
        res.locals.preventOAuthBackButton = `
      <script>
        (function() {
          // Prevent back button navigation to OAuth pages
          if (window.history && window.history.pushState) {
            window.addEventListener('load', function() {
              // Replace current state to prevent OAuth back navigation
              window.history.replaceState(null, null, window.location.href);
              
              // Handle back button
              window.addEventListener('popstate', function(event) {
                const referrer = document.referrer;
                if (referrer.includes('accounts.google.com') || 
                    referrer.includes('/auth/google') ||
                    referrer.includes('oauth')) {
                  window.history.pushState(null, null, window.location.href);
                }
              });
            });
          }
        })();
      </script>
    `;

   
    return checkUserBlocked(req, res, next);
  } catch (err) {
    console.error('Error in protectUser middleware:', err);
    return res.status(500).render('error/500', { title: 'Server Error' });
  }
};
