require('dotenv').config();
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const User = require('../../model/userSchema')
const sendMail = require('../../helper/mailer');
require('dotenv').config(); 

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.NODEMAILER_EMAIL,
    pass: process.env.NODEMAILER_PASS,
  },
});

exports.loadHomePage = async (req, res) => {
  try {
    // Additional session validation
    if (!req.session?.user) {
      return res.redirect('/login');
    }

    const userId=req.session.user.id;
    const user= await User.findById(userId);


    // Set cache control headers to prevent back button issues
    res.set({
      'Cache-Control': 'no-store, no-cache, must-revalidate, private',
      'Pragma': 'no-cache',
      'Expires': '0'
    });

    res.render('user/home', {
      isAuthenticated: true,
      user,
      welcomeMessage: req.session.justLoggedIn ? 'Welcome back!' : null,
      sessionSecurity: `
        <script>
          // Prevent back button to login page after successful login
          (function() {
            if (window.history && window.history.pushState) {
              window.addEventListener('load', function() {
                // Replace current state to prevent back navigation to login
                window.history.replaceState(null, null, window.location.href);
                
                // Handle back button attempts
                window.addEventListener('popstate', function(event) {
                  // Push current state again to prevent going back
                  window.history.pushState(null, null, window.location.href);
                });
              });
            }
            
            // Prevent page caching
            window.addEventListener('beforeunload', function() {
              // Clear any cached data
              if (window.performance && window.performance.navigation.type === 2) {
                window.location.reload();
              }
            });
          })();
        </script>
      `
    });
    
    // Clear welcome message flag
    delete req.session.justLoggedIn;
    
  } catch(err) {
    console.log("error is loading home page", err);
    res.status(500).render('error/500', {title: 'server error'});
  }
};




exports.loadLandingPage=(req,res)=>{
    try{
      res.render('user/landing')
    }catch(err){
        console.log("error in loading landing page",err);
        res.render('error/500',{title:'server error'});
    }
    console.log("landing page loaded")
}

// Render login page
exports.getLogin = (req, res) => {

  console.log('Rendering login page');
  const justRegistered = req.session.justRegistered ? req.session.justRegistered : false;
  console.log(justRegistered);
  delete req.session.justRegistered;
  
  // Handle different error scenarios from URL parameters
  let errorMessage = null;
  let successMessage = null;
  
  if (req.query.error) {
    switch (req.query.error) {
      case 'account_blocked':
        errorMessage = 'Your account has been blocked by the administrator. Please contact support for assistance.';
        break;
      case 'auth_failed':
        errorMessage = 'Authentication failed. Please try again.';
        break;
      case 'session_error':
        errorMessage = 'Session error occurred. Please try logging in again.';
        break;
      case 'server_error':
        errorMessage = 'Server error occurred. Please try again later.';
        break;
      case 'oauth_failed':
        errorMessage = 'Google authentication failed. Please try again or use email/password.';
        break;
      default:
        errorMessage = 'An error occurred. Please try again.';
    }
  }
  
  if (req.query.success) {
    switch (req.query.success) {
      case 'password_reset':
        successMessage = 'Password reset successfully. Please login with your new password.';
        break;
      case 'account_created':
        successMessage = 'Account created successfully. Please login.';
        break;
    }
  }
  
  res.render('user/login', {
    message: null,
    isError: false,
    oldInput: {},
    justRegistered,
    error: errorMessage,
    success: successMessage,
    query: req.query
  });
};

// Handle login POST - UPDATED FOR NAME FIELD
exports.postLogin = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.render('user/login', {
        error: 'Email and password are required.',
        success: null,
        email: email || '',
        query: req.query,
        justRegistered: false,
      });
    }

    const user = await User.findOne({ email });

    if (!user) {
      return res.render('user/login', {
        error: 'Invalid email or password. Please try again.',
        success: null,
        email: email,
        query: req.query,
        justRegistered: false,
      });
    }

    if (user.isBlocked) {
      console.log(`Blocked user attempted login: ${email}`);
      return res.render('user/login', {
        error: 'Your account has been blocked by the administrator. Please contact support for assistance.',
        success: null,
        email: email,
        query: req.query,
        justRegistered: false,
        isBlocked: true,
        supportEmail: process.env.SUPPORT_EMAIL || 'support@melodia.com'
      });
    }

    const passwordMatches = await bcrypt.compare(password, user.password);

    if (!passwordMatches) {
      return res.render('user/login', {
        error: 'Invalid email or password. Please try again.',
        success: null,
        email: email,
        query: req.query,
        justRegistered: false,
      });
    }

    
    req.session.user = {
      id: user._id,
      name: user.name,
      role: user.role,
      email: user.email,
      isAdmin: user.isAdmin || false,
      loginTime: new Date()
    };
   
    req.session.justLoggedIn = true;
    
    req.session.save((err) => {
      if (err) {
        console.error('Session save error in login:', err);
        return res.render('user/login', {
          error: 'Server error. Please try again later.',
          success: null,
          email: email,
          query: req.query,
          justRegistered: false,
        });
      }
      
      console.log('User logged in successfully:', user.email);
      console.log('Session saved, redirecting to home...');
      
      // Set cache control headers to prevent back button issues
      res.set({
        'Cache-Control': 'no-store, no-cache, must-revalidate, private',
        'Pragma': 'no-cache',
        'Expires': '0'
      });
      
      // Use client-side redirect with history replacement to prevent back button
      res.send(`
        <script>
          // Replace current history entry to prevent back button issues
          window.history.replaceState(null, null, '/home');
          window.location.href = '/home';
        </script>
      `);
    });

  } catch (err) {
    console.error('Error in postLogin:', err);
    res.render('user/login', {
      error: 'Server error. Please try again later.',
      success: null,
      email: req.body.email || '',
      query: req.query,
      justRegistered: false,
    });
  }
};



// Render signup page
exports.getSignup = (req, res) => {
    console.log('Rendering signup page');
  res.render('user/signUp', {
    message: null,
    isError: false,
    oldInput: {},
  });
};


exports.postSignup = async (req, res) => {
    console.log('Email config check:', {
        email: process.env.NODEMAILER_EMAIL,
        pass: process.env.NODEMAILER_PASS ? 'SET' : 'NOT SET'
    });
    console.log('postSignup called with:', req.body);

    try {
        const { firstName, lastName, email, phone, password, confirmPass } = req.body;

        // Enhanced validation
        if (!firstName || !lastName || !email || !phone || !password || !confirmPass) {
            return res.render('user/signUp', {
                message: 'All fields are required.',
                isError: true,
                oldInput: { firstName, lastName, email, phone },
            });
        }

        if (password.length < 6) {
            return res.render('user/signUp', {
                message: 'Password must be at least 6 characters long.',
                isError: true,
                oldInput: { firstName, lastName, email, phone },
            });
        }

        if (password !== confirmPass) {
            return res.render('user/signUp', {
                message: 'Passwords do not match.',
                isError: true,
                oldInput: { firstName, lastName, email, phone },
            });
        }

        // Email format validation
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            return res.render('user/signUp', {
                message: 'Please enter a valid email address.',
                isError: true,
                oldInput: { firstName, lastName, email, phone },
            });
        }

        // Phone validation
        const phoneRegex = /^[0-9]{10}$/;
        if (!phoneRegex.test(phone.replace(/\s/g, ''))) {
            return res.render('user/signUp', {
                message: 'Please enter a valid 10-digit phone number.',
                isError: true,
                oldInput: { firstName, lastName, email, phone },
            });
        }

        const existingUser = await User.findOne({
            $or: [{ email }, { phone }],
        });

        if (existingUser) {
          console.log('Existing user found:', existingUser);
          let errorMessage = 'Email already exists.';
          if (existingUser.phone === phone) {
              errorMessage = 'Phone number already exists.';
          }
          return res.render('user/signUp', {
              message: errorMessage,
              isError: true,
              oldInput: { firstName, lastName, email, phone },
          });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        // Generate OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString();

        // Combine firstName and lastName into name field
        req.session.signupData = {
            name: `${firstName.trim()} ${lastName.trim()}`, // Combined name field
            email,
            phone,
            password: hashedPassword,
            role: 'user',
            isBlocked: false,
        };
        
        req.session.otp = {
            code: otp,
            email,
            expires: Date.now() + 5 * 60 * 1000,
        };

        // Save session
        await new Promise((resolve, reject) => {
            req.session.save((err) => {
                if (err) {
                    console.error('Session save error in signup:', err);
                    return reject(err);
                }
                resolve();
            });
        });

        console.log('OTP generated:', otp);

        // Send OTP via email
        await sendMail(
            email,
            'Your Melodia OTP',
            `Your OTP is: ${otp}`,
            `<p>Your OTP is: <b>${otp}</b></p><p>This OTP will expire in 5 minutes.</p>`
        );

        res.render('user/otp-verification', {
            title: 'Verify OTP',
            email,
            message: 'OTP sent to your email.',
            isError: false,
            otpExpires: req.session.otp.expires,
        });

    } catch (err) {
        console.error('Error in postSignup:', err);
        res.render('user/signUp', {
            message: 'Server error. Please try again later.',
            isError: true,
            oldInput: {
                firstName: req.body.firstName || '',
                lastName: req.body.lastName || '',
                email: req.body.email || '',
                phone: req.body.phone || '',
            },
        });
    }
};

// Handle OTP verification - UPDATED FOR NAME FIELD
exports.verifyOtp = async (req, res) => {
  try {

    let { email, otp } = req.body;

    // Handle array inputs (in case form sends arrays)
    email = Array.isArray(email) ? email[0] : email;
    otp = Array.isArray(otp) ? otp.join('') : otp;

    console.log('Processed email:', email);
    console.log('Processed OTP:', otp);

    // Validate inputs
    if (!email || !otp) {
      console.log('Missing email or OTP');
      return res.render('user/otp-verification', {
        title: 'Verify OTP',
        email: email || '',
        message: 'Please enter both email and OTP.',
        isError: true,
        otpExpires: req.session.otp?.expires || null
      });
    }

    // Validate OTP session data
    if (!req.session.otp) {
      console.log('No OTP session found');
      return res.render('user/otp-verification', {
        title: 'Verify OTP',
        email,
        message: 'OTP session expired. Please sign up again.',
        isError: true,
      });
    }

    if (req.session.otp.email !== email) {
      console.log('Email mismatch:', req.session.otp.email, 'vs', email);
      return res.render('user/otp-verification', {
        title: 'Verify OTP',
        email,
        message: 'Invalid session. Please sign up again.',
        isError: true,
      });
    }

    if (req.session.otp.code !== otp) {
      console.log('OTP mismatch:', req.session.otp.code, 'vs', otp);
      return res.render('user/otp-verification', {
        title: 'Verify OTP',
        email,
        message: 'Invalid OTP. Please try again.',
        isError: true,
        otpExpires: req.session.otp.expires
      });
    }

    if (req.session.otp.expires < Date.now()) {
      console.log('OTP expired');
      return res.render('user/otp-verification', {
        title: 'Verify OTP',
        email,
        message: 'OTP has expired. Please request a new one.',
        isError: true,
      });
    }

    // Validate signup data exists
    if (!req.session.signupData || req.session.signupData.email !== email) {
      console.log('Signup data missing or email mismatch');
      return res.render('user/otp-verification', {
        title: 'Verify OTP',
        email,
        message: 'Session expired. Please sign up again.',
        isError: true,
      });
    }

    console.log('All validations passed, creating user...');

    // UPDATED: Extract signup data with name field
    const { name, email: signupEmail, phone, password, role, isBlocked } = req.session.signupData;

    // UPDATED: Create userData with name field only
    const userData = {
      name: name?.trim(),
      email: signupEmail?.trim(),
      phone: phone?.trim(),
      password,
      role: role || 'user',
      isBlocked: isBlocked || false,
    };

    console.log('Creating user with data:', { ...userData, password: '[HIDDEN]' });

    // Check if user already exists
    const existingUser = await User.findOne({
      $or: [{ email: userData.email }, { phone: userData.phone }]
    });

    if (existingUser) {
      console.log('User already exists during verification:', existingUser.email);
      return res.render('user/otp-verification', {
        title: 'Verify OTP',
        email,
        message: 'An account with this email or phone already exists.',
        isError: true,
      });
    }

    // Create and save user
    const user = new User(userData);
    console.log('User object created, attempting to save...');
    
    const savedUser = await user.save();
    console.log('User saved successfully:', savedUser._id);

    // UPDATED: Set session data with name field
    req.session.user = {
      id: savedUser._id,
      name: savedUser.name,
      role: savedUser.role,
      email: savedUser.email,
     
    };
    
    req.session.justRegistered = true;

    // Clean up temporary session data
    delete req.session.otp;
    delete req.session.signupData;

    console.log('Session updated, saving...');

    // Save session and redirect
    req.session.save((err) => {
      if (err) {
        console.error('Session save error in verifyOtp:', err);
        return res.render('user/otp-verification', {
          title: 'Verify OTP',
          email,
          message: 'Account created but login failed. Please try logging in manually.',
          isError: true,
        });
      }

      console.log('Session saved successfully, redirecting to home...');
      res.redirect('/user/home');
    });

  } catch (err) {
    console.error("ERROR in verifyOtp");
    
  

    // Generic server error
    res.render('user/otp-verification', {
      title: 'Verify OTP',
      email: req.body.email || '',
      message: 'Server error occurred. Please try again or contact support.',
      isError: true,
    });
  }
};

// Handle OTP resend - NO CHANGES NEEDED
exports.resendOtp = async (req, res) => {
  try {

    const { email } = req.body;

    if (!email) {
      return res.json({
        success: false,
        message: 'Email is required.'
      });
    }

    if (!req.session.signupData) {
      return res.json({
        success: false,
        message: 'Session expired. Please sign up again.'
      });
    }

    if (req.session.signupData.email !== email) {
      return res.json({
        success: false,
        message: 'Invalid session. Please sign up again.'
      });
    }

    // Generate new OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpires = Date.now() + 5 * 60 * 1000;

    req.session.otp = {
      code: otp,
      email,
      expires: otpExpires,
    };

    // Save session
    await new Promise((resolve, reject) => {
      req.session.save((err) => {
        if (err) {
          console.error('Session save error in resendOtp:', err);
          return reject(err);
        }
        resolve();
      });
    });

    console.log('New OTP generated:', otp);

    // Send OTP email
    await sendMail(
      email,
      'Your Melodia OTP - Resent',
      `Your new OTP is: ${otp}`,
      `<p>Your new OTP is: <b>${otp}</b></p><p>This OTP will expire in 5 minutes.</p>`
    );

    console.log('OTP resent successfully');

    res.json({
      success: true,
      message: 'OTP resent successfully!',
      otpExpires: otpExpires
    });

  } catch (err) {
    console.error('Error in resendOtp:', err);
    res.json({
      success: false,
      message: 'Failed to resend OTP. Please try again.'
    });
  }
};

exports.googleCallback = async (req, res) => {
  try {
    console.log('Google callback handler called');
    console.log('Authenticated user:', req.user);
    
    if (!req.user) {
      console.log('No user found after Google auth');
      return res.redirect('/login?error=auth_failed');
    }

    const user = req.user;

    if (user.isBlocked) {
      console.log('Blocked user attempted Google OAuth login:', user.email);
      return res.redirect('/login?error=account_blocked&email=' + encodeURIComponent(user.email));
    }

    // Set session data
    req.session.user = {
      id: user._id,
      name: user.name,
      role: user.role,
      email: user.email,
      isAdmin: user.isAdmin || false,
      loginTime: new Date()
    };
   
    req.session.justLoggedIn = true;
    
    // Save session and redirect with proper cache control
    req.session.save((err) => {
      if (err) {
        console.error('Session save error in googleCallback:', err);
        return res.redirect('/login?error=session_error');
      }
      
      console.log('Google OAuth successful, redirecting to home');
      
      // Set cache control headers to prevent back button issues
      res.set({
        'Cache-Control': 'no-store, no-cache, must-revalidate, private',
        'Pragma': 'no-cache',
        'Expires': '0'
      });
      
      // Use a client-side redirect with history replacement to prevent back button
      res.send(`
        <script>
          // Replace current history entry to prevent back button issues
          window.history.replaceState(null, null, '/home');
          window.location.href = '/home';
        </script>
      `);
    });

  } catch (err) {
    console.error('Error in googleCallback:', err);
    res.redirect('/login?error=server_error');
  }
};


// Render forgot password page
exports.getForgotPassword = (req, res) => {
  res.render('user/forgot-password', {
    message: null,
    isError: false,
    oldInput: {},
  });
};

// Handle forgot password POST
exports.postForgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.render('user/forgot-password', {
        message: 'Email is required.',
        isError: true,
        oldInput: { email },
      });
    }

    const user = await User.findOne({ email });

    if (!user) {
      return res.render('user/forgot-password', {
        message: 'Email not found.',
        isError: true,
        oldInput: { email },
      });
    }

    const token = crypto.randomBytes(20).toString('hex');

    req.session.resetToken = {
      token,
      email,
      expires: Date.now() + 5 * 60 * 1000, 
    };

    if (!process.env.NODEMAILER_EMAIL || !process.env.NODEMAILER_PASS) {
      return res.render('user/forgot-password', {
        message: 'Email service configuration error.',
        isError: true,
        oldInput: { email },
      });
    }

    const resetUrl = `${process.env.APP_BASE_URL || 'http://localhost:3000'}/user/reset-password/${token}`;
      
    await transporter.sendMail({
      to: email,
      subject: 'Melodia Password Reset',
      html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Melodia Password Reset</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            background-color: #f9fafb;
            margin: 0;
            padding: 0;
          }
          .container {
            max-width: 600px;
            margin: 20px auto;
            background: #fff;
            border-radius: 10px;
            overflow: hidden;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
          }
          .header {
            background: #000;
            color: #fff;
            text-align: center;
            padding: 20px;
          }
          .content {
            padding: 30px;
          }
          .btn {
            display: inline-block;
            background: #000;
            color: #fff;
            padding: 12px 25px;
            text-decoration: none;
            border-radius: 6px;
            margin-top: 20px;
            font-weight: bold;
          }
          .footer {
            font-size: 12px;
            color: #6b7280;
            text-align: center;
            padding: 15px;
            border-top: 1px solid #e5e7eb;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Melodia</h1>
          </div>
          <div class="content">
            <h2>Password Reset Request</h2>
            <p>We received a request to reset your <strong>Melodia</strong> account password. Click the button below to reset it:</p>
            
            <p style="text-align: center;">
              <a href="${resetUrl}" class="btn">Reset Password</a>
            </p>

            <p><strong>Note:</strong> This link will expire in 5 minutes. If you didn't request this, please ignore this email.</p>

            <p>If the button doesn't work, copy and paste this link into your browser:</p>
            <p style="word-break: break-all; color: #2563eb;">${resetUrl}</p>
          </div>
          <div class="footer">
            © ${new Date().getFullYear()} Melodia. All rights reserved.
          </div>
        </div>
      </body>
      </html>
      `,
      text: `Reset your Melodia password here: ${resetUrl}\n\nThis link will expire in 5 minutes.`
    });

    // Save session before rendering
    req.session.save((err) => {
      if (err) {
        console.error('Session save error in postForgotPassword:', err);
        return res.render('user/forgot-password', {
          message: 'Server error. Please try again later.',
          isError: true,
          oldInput: { email },
        });
      }

      res.render('user/forgot-password', {
        message: 'Reset link sent to your email.',
        isError: false,
        oldInput: {},
      });
    });

  } catch (err) {
    console.error('Error in postForgotPassword:', err);
    res.render('user/forgot-password', {
      message: 'Server error. Please try again later.',
      isError: true,
      oldInput: { email: req.body.email || '' },
    });
  }
};

// Render reset password page
exports.getResetPassword = (req, res) => {
  try {
    const { token } = req.params;
    
    if (req.session.resetToken) {
      console.log('Session token:', req.session.resetToken.token);
    }

    // VALIDATION LOGIC (This was missing!)
    if (!req.session.resetToken) {
      console.log('No reset token in session');
      return res.render('user/forgot-password', {
        message: 'Reset session not found. Please request a new reset link.',
        isError: true,
        oldInput: {},
      });
    }

    if (req.session.resetToken.token !== token) {
      console.log('Token mismatch');
      return res.render('user/forgot-password', {
        message: 'Invalid reset link. Please request a new one.',
        isError: true,
        oldInput: {},
      });
    }

    if (req.session.resetToken.expires < Date.now()) {
      console.log('Token expired');
      // Clean up expired token
      delete req.session.resetToken;
      return res.render('user/forgot-password', {
        message: 'Reset link has expired. Please request a new one.',
        isError: true,
        oldInput: {},
      });
    }

    // RENDER THE RESET PASSWORD PAGE (This was missing!)
    console.log('All validations passed, rendering reset password page');
    res.render('user/reset-password', {
      title: 'Reset Password',
      token,
      message: null,
      isError: false,
    });

  } catch (err) {
    console.error('Error in getResetPassword:', err);
    res.render('error/500', { title: 'Server Error' });
  }
};




// Handle reset password POST
exports.postResetPassword = async (req, res) => {
  try {
    const { token } = req.params;
    const { password, confirmPassword } = req.body;

    // Validate session and token
    if (!req.session.resetToken || 
        req.session.resetToken.token !== token || 
        req.session.resetToken.expires < Date.now()) {
      return res.render('user/reset-password', {
        title: 'Reset Password',
        token,
        message: 'Invalid or expired reset link. Please request a new password reset.',
        isError: true,
      });
    }

    // Server-side validation (backup)
    if (!password || password.length < 6) {
      return res.render('user/reset-password', {
        title: 'Reset Password',
        token,
        message: 'Password must be at least 6 characters long.',
        isError: true,
      });
    }

    if (password !== confirmPassword) {
      return res.render('user/reset-password', {
        title: 'Reset Password',
        token,
        message: 'Passwords do not match.',
        isError: true,
      });
    }

    // Find user
    const user = await User.findOne({ email: req.session.resetToken.email });
    if (!user) {
      return res.render('user/reset-password', {
        title: 'Reset Password',
        token,
        message: 'User account not found.',
        isError: true,
      });
    }

    // Update password
    user.password = await bcrypt.hash(password, 10);
    await user.save();

    // Clean up reset token
    delete req.session.resetToken;

    // Save session and redirect
    req.session.save((err) => {
      if (err) {
        console.error('Session save error in postResetPassword:', err);
        return res.render('user/reset-password', {
          title: 'Reset Password',
          token,
          message: 'Password updated but session error occurred. Please try logging in.',
          isError: true,
        });
      }

      console.log('Session saved, redirecting to login...');
      // FIXED: Only redirect, don't render and redirect
      res.redirect('/user/login?success=password_reset');
    });

  } catch (err) {
    console.error('Error in postResetPassword:', err);
    res.render('user/reset-password', {
      title: 'Reset Password',
      token: req.params.token,
      message: 'Server error occurred. Please try again.',
      isError: true,
    });
  }
};
