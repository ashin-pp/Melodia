require('dotenv').config();
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const User = require('../../model/userSchema')
const sendMail = require('../../helper/mailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.NODEMAILER_EMAIL,
    pass: process.env.NODEMAILER_PASS,
  },
});

exports.loadLandingPage=(req,res)=>{
    try{
      res.render('user/landing')
    }catch(err){
        console.log("error in loading landing page",err);
        res.render('error/500',{tittle:'server error'});
    }
    console.log("landing page loaded")
}

// Render login page
exports.getLogin = (req, res) => {
  const justRegistered=req.session.justRegistered?req.session.justRegistered:false;
  console.log(justRegistered)
  delete req.session.justRegistered;
  res.render('user/login', {
    message:null,
    isError: false,
    oldInput: {},
    justRegistered,
  });
};

// Handle login POST
exports.postLogin = async (req, res) => {

  
  try {
    const { email, password } = req.body;


    if (!email || !password) {
      return res.render('user/login', {
        message: 'Email and password are required.',
        isError: true,
        oldInput: { email },
      });
    }

    const user = await User.findOne({ email });

    if (!user) {
      return res.render('user/login', {
        message: 'Invalid credentials.',
        isError: true,
        oldInput: { email },
      });
    }

    if (user.isBlocked) {
      return res.render('user/login', {
        message: 'Your account has been blocked. Contact admin.',
        isError: true,
        oldInput: { email },
      });
    }

    const passwordMatches = await bcrypt.compare(password, user.password);

    if (!passwordMatches) {
      return res.render('user/login', {
        message: 'Invalid credentials.',
        isError: true,
        oldInput: { email },
      });
    }

    // Set user session data
    req.session.user = {
      id: user._id,
      fullName: user.fullName,
      role: user.role,
      email: user.email,
    };
   
 req.session.justLoggedIn= true;
    req.session.save((err) => {
      if (err) {
        console.error('Session save error in login:', err);
        return res.render('user/login', {
          message: 'Server error. Please try again later.',
          isError: true,
          oldInput: { email },
        });
      }
      res.redirect('/');
    });

  } catch (err) {
    console.error('Error in postLogin:', err);
    res.render('user/login', {
      message: 'Server error. Please try again later.',
      isError: true,
      oldInput: { email: req.body.email || '' },
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

// Handle signup POST
exports.postSignup = async (req, res) => {
    // Add this debug check at the beginning of postSignup
    console.log('Email config check:', {
        email: process.env.NODEMAILER_EMAIL,
        pass: process.env.NODEMAILER_PASS ? 'SET' : 'NOT SET'
    });
    console.log('postSignup called with:', req.body);

    try {
        const { firstName, lastName, email, phone, password, confirmPass } = req.body;

        if (!firstName || !lastName || !email || !phone || !password || !confirmPass || password.length < 6) {
            return res.render('user/signUp', {
                message: 'All fields are required and password must be at least 6 characters.',
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

        const existingUser = await User.findOne({
            $or: [{ email }, { phone }],
        });

        if (existingUser) {
          console.log('Existing user found:', existingUser);
            return res.render('user/signUp', {
                message: 'Email or phone already exists.',
                isError: true,
                oldInput: { firstName, lastName, email, phone },
            });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        // Generate OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString();

        req.session.signupData = {
            firstName,
            lastName,
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

        // Wrap the session save in a Promise for async/await
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
            `<p>Your OTP is: <b>${otp}</b></p>`
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
        // This is a global catch for any errors, including session save and email sending
        res.render('user/signUp', {
            message: 'Server error. Please try again later.',
            isError: true,
            oldInput: {
                firstName: req.body.firstName,
                lastName: req.body.lastName,
                email: req.body.email,
                phone: req.body.phone,
            },
        });
    }
};
// Handle OTP verification - FIXED VERSION
exports.verifyOtp = async (req, res) => {
  try {
    let { email, otp } = req.body;


    // Handle array inputs (in case form sends arrays)
    email = Array.isArray(email) ? email[0] : email;
    otp = Array.isArray(otp) ? otp.join('') : otp;
   console.log(otp)
  //  console.log(req.session.otp.code+" =====")
    // Validate OTP session data
    if (
      !req.session.otp ||
      req.session.otp.email !== email ||
      req.session.otp.code !== otp ||
      req.session.otp.expires < Date.now()
    ) {
      return res.render('user/otp-verification', {
        title: 'Verify OTP',
        email,
        message: 'Invalid OTP or OTP expired.',
        isError: true,
      });
    }

    // Validate signup data exists
    if (!req.session.signupData || req.session.signupData.email !== email) {
      return res.render('user/otp-verification', {
        title: 'Verify OTP',
        email,
        message: 'Signup data not found. Please try signing up again .',
        isError: true,
      });
    }

    // Extract signup data
    const { firstName,lastName, email: signupEmail, phone, password, role, isBlocked } = req.session.signupData;

    console.log(req.session.signupdata,"<<<<<")

    // Create new user
    const user = new User({
      firstName,
      lastName,
      email: signupEmail,
      phone,
      password,
      role,
      isBlocked,
    });

    // Save user to database
    await user.save();

    // Set user session data
    req.session.user = {
      id: user._id,
      firstName: user.firstName,
      role: user.role,
      email: user.email,
    };
    req.session.justRegistered=true;
    // Clean up temporary session data
    delete req.session.otp;
    delete req.session.signupData;
console.log()
    // Save session and redirect
    req.session.save((err) => {
      if (err) {
        console.error('Session save error in verifyOtp:', err);
        return res.render('user/otp-verification', {
          title: 'Verify OTP',
          email,
          message: 'Server error. Please try again.',
          isError: true,
        });
      }

      // Success - redirect to home page
      console.log("OTP verified, redirecting to home...");

      res.redirect('/user/home');
    });

  } catch (err) {
    console.error('Error in verifyOtp:', err);
    
    // Handle duplicate key error (user already exists)
    if (err.code === 11000) {
      const field = Object.keys(err.keyPattern)[0];
      const message = `${field === 'email' ? 'Email' : 'Phone number'} already exists.`;
      
      return res.render('user/otp-verification', {
        title: 'Verify OTP',
        email: req.body.email || '',
        message,
        isError: true,
      });
    }

    // General server error
    res.render('user/otp-verification', {
      title: 'Verify OTP',
      email: req.body.email || '',
      message: 'Server error. Please try again.',
      isError: true,
    });
  }
};

// Handle OTP resend
exports.resendOtp = async (req, res) => {
  console.log("resend otp clicked");
  try {
    // Use email from session if not in request body
    const email = req.body.email || (req.session.signupData && req.session.signupData.email);

    if (!email || !req.session.signupData || req.session.signupData.email !== email) {
      return res.render('user/otp-verification', {
        title: 'Verify OTP',
        email,
        message: 'Signup data not found. Please try signing up again.',
        isError: true,
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

    // Save session before sending mail
    await new Promise((resolve, reject) => {
      req.session.save((err) => {
        if (err) {
          console.error('Session save error in resendOtp:', err);
          return reject(err);
        }
        resolve();
      });
    });

    // Send OTP email
    await sendMail(
      email,
      'Your Melodia OTP',
      `Your OTP is: ${otp}`,
      `<p>Your OTP is: <b>${otp}</b></p>`
    );

    console.log("Resent OTP:", otp);

    // Render OTP page with new expiry
    res.render('user/otp-verification', {
      title: 'Verify OTP',
      email,
      message: 'OTP resent to your email.',
      isError: false,
      otpExpires,
    });

  } catch (err) {
    console.error('Error in resendOtp:', err);
    res.render('user/otp-verification', {
      title: 'Verify OTP',
      email: req.body.email || '',
      message: 'Server error. Please try again.',
      isError: true,
    });
  }
};

// Handle Google/ SSO callback
exports.googleCallback = async (req, res) => {
  try {
    const user = await User.findOne({ email: req.user.email });

    if (!user) {
      return res.render('user/login-verification', {
        message: 'User not found. Please sign up.',
        isError: true,
        oldInput: { email: req.user.email },
      });
    }

    if (user.isBlocked) {
      return res.render('user/login-verification', {
        message: 'Your account has been blocked. Contact admin.',
        isError: true,
        oldInput: { email: req.user.email },
      });
    }

    req.session.user = {
      id: user._id,
      fullName: user.fullName,
      role: user.role,
      email: user.email,
    };
   
  req.session.justLoggedIn=true;
    req.session.save((err) => {
      if (err) {
        console.error('Session save error in googleCallback:', err);
        return res.render('error/500', { title: 'Server Error' });
      }
      res.redirect('/');
    });

  } catch (err) {
    console.error('Error in googleCallback:', err);
    res.render('error/500', { title: 'Server Error' });
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
      return res.render('user/forgot-Password', {
        message: 'Email is required.',
        isError: true,
        oldInput: { email },
      });
    }

    const user = await User.findOne({ email });

    if (!user) {
      return res.render('user/forgot-Password', {
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
      return res.render('user/forgot-Password', {
        message: 'Email service configuration error.',
        isError: true,
        oldInput: { email },
      });
    }

    const resetUrl = `${process.env.APP_BASE_URL || 'http://localhost:3000'}/user/reset-password/${token}`;

   await transporter.sendMail({
  to: email,
  subject: 'SuperKicks Password Reset',
  html: `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>SuperKicks Password Reset</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
      @media only screen and (max-width: 600px) {
        .container {
          width: 100% !important;
        }
      }
    </style>
  </head>
  <body class="bg-gray-100 font-sans">
    <div class="max-w-2xl mx-auto my-8">
      <div class="bg-black text-white py-5 text-center">
        <h1 class="text-2xl font-bold">SuperKicks</h1>
      </div>
      
      <div class="bg-white p-8">
        <h2 class="text-2xl font-bold text-gray-800 mb-4">Password Reset Request</h2>
        <p class="text-gray-600 mb-6">
          We received a request to reset your SuperKicks account password. Click the button below to proceed:
        </p>
        
        <div class="text-center my-6">
          <a href="${resetUrl}" class="inline-block bg-black hover:bg-gray-800 text-white font-bold py-3 px-6 rounded-lg transition duration-200">
            Reset Password
          </a>
        </div>
        
        <p class="text-sm text-gray-500 mb-4">
          <strong class="font-semibold">Note:</strong> This link will expire in 5 minutes. If you didn't request this, please ignore this email.
        </p>
        
        <p class="text-gray-600 text-sm mt-8 pt-4 border-t border-gray-200">
          Can't click the button? Copy and paste this link into your browser:<br>
          <span class="text-blue-600 break-all">${resetUrl}</span>
        </p>
      </div>
    </div>
  </body>
  </html>
  `,
  text: `Reset your SuperKicks password here: ${resetUrl}\n\nThis link will expire in 5 minutes.`
});
    // Save session before rendering
    req.session.save((err) => {
      if (err) {
        console.error('Session save error in postForgotPassword:', err);
        return res.render('user/forgot-Password', {
          message: 'Server error. Please try again later.',
          isError: true,
          oldInput: { email },
        });
      }

      res.render('user/forgot-Password', {
        message: 'Reset link sent to your email.',
        isError: false,
        oldInput: {},
      });
    });

  } catch (err) {
    console.error('Error in postForgotPassword:', err);
    res.render('user/forgot-Password', {
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

    if (
      !req.session.resetToken ||
      req.session.resetToken.token !== token ||
      req.session.resetToken.expires < Date.now()
    ) {
      return res.render('user/forgot-Password', {
        message: 'Invalid or expired reset link.',
        isError: true,
        oldInput: {},
      });
    }

    res.render('user/reset-Password', {
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

// Handle reset password POST - FIXED VERSION
exports.postResetPassword = async (req, res) => {
  try {
    const { token } = req.params;
    const { password } = req.body;
    console.log(password)

    if (
      !req.session.resetToken ||
      req.session.resetToken.token !== token ||
      req.session.resetToken.expires < Date.now()
    ) {
      return res.render('user/forgot-Password', {
        message: 'Invalid or expired reset link.',
        isError: true,
        oldInput: {},
      });
    }

    if (!password || password.length < 6) {
      return res.render('user/reset-Password', {
        title: 'Reset Password',
        token,
        message: 'Password must be at least 6 characters long.',
        isError: true,
      });
    }

    const user = await User.findOne({ email: req.session.resetToken.email });

    if (!user) {
      return res.render('user/forgot-Password', {
        message: 'User not found.',
        isError: true,
        oldInput: {},
      });
    }

    // Update user password
    user.password = await bcrypt.hash(password, 10);
    await user.save();

    // Clean up reset token
    delete req.session.resetToken;

    // Save session and redirect
    req.session.save((err) => {
      if (err) {
        console.error('Session save error in postResetPassword:', err);
        return res.render('user/forgotPassword', {
          message: 'Server error. Please try again later.',
          isError: true,
          oldInput: {},
        });
      }

      res.redirect('/user/login');
    });

  } catch (err) {
    console.error('Error in postResetPassword:', err);
    res.render('user/reset-Password', {
      title: 'Reset Password',
      token: req.params.token,
      message: 'Server error. Please try again later.',
      isError: true,
    });
  }
};


exports.logout = (req, res) => {
  try {
    // Check if user is logged in
    if (!req.session.user) {
      return res.redirect('/user/login');
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
      
      res.redirect('/user/login');
    });

  } catch (err) {
    console.error('Error in logout:', err);
    res.render('error/500', { title: 'Server Error' });
  }
};