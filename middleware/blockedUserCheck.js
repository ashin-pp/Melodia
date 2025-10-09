// const User = require('../model/userSchema');

// // Middleware to check if user is blocked during authentication
// exports.checkUserBlocked = async (req, res, next) => {
//     try {
//         if (req.body.email) {
//             const user = await User.findOne({ email: req.body.email });
//             if (user && user.isBlocked) {
//                 console.log(`Blocked user attempted login: ${req.body.email}`);
//                 return res.render('user/login', {
//                     error: 'Your account has been blocked by the administrator. Please contact support for assistance.',
//                     success: null,
//                     email: req.body.email,
//                     query: req.query,
//                     justRegistered: false,
//                     isBlocked: true,
//                     supportEmail: process.env.SUPPORT_EMAIL || 'support@melodia.com'
//                 });
//             }
//         }
//         next();
//     } catch (error) {
//         console.error('Error checking blocked user:', error);
//         next();
//     }
// };

// // Helper function to get blocked user message
// exports.getBlockedUserMessage = (email) => {
//     return {
//         title: 'Account Blocked',
//         message: `Your account has been blocked by the administrator.`,
//         supportEmail: process.env.SUPPORT_EMAIL || 'support@melodia.com',
//         email: email
//     };
// };