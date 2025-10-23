import User from '../../model/userSchema.js';
import bcrypt from 'bcryptjs';

export const getLogin = (req, res) => {

  res.set({
    'Cache-Control': 'no-cache, no-store, must-revalidate, private',
    'Pragma': 'no-cache',
    'Expires': '0'
  });
  if (req.session && req.session.admin) {
    console.log('Admin session found in getLogin, redirecting to dashboard');
    return res.redirect('/admin/dashboard');
  }

  res.render('admin/login');
};


export const postLogin = async (req, res) => {
  const { email, password } = req.body;
  let errMessage = "";
  
  try {
    if (!email || !password) {
      errMessage = "All fields are required";
      return res.status(400).render('admin/login', { errMessage });
    }
    
    const normalizedEmail = email.trim().toLowerCase();
    const user = await User.findOne({ email: normalizedEmail });
    
    if (!user) {
      errMessage = 'Invalid email or password.';
      return res.status(401).render('admin/login', { errMessage });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      errMessage = 'Invalid email or password.';
      return res.status(401).render('admin/login', { errMessage });
    }
    
    if (user.role !== 'admin') {
      errMessage = 'Access denied. You are not an admin.';
      return res.status(403).render('admin/login', { errMessage });
    }


  
      req.session.admin = {
        id: user._id,
        email: user.email,
        role: user.role,
        name: user.name || 'ADMIN'
      };

      req.session.save((err) => {
        if (err) {
          console.error('Session save error:', err);
          errMessage = 'Server error, please try again later.';
          return res.status(500).render('admin/login', { errMessage });
        }
        return res.redirect('/admin/dashboard');
      });
    

  } catch (err) {
    console.error('Admin login error:', err);
    errMessage = 'Server error, please try again later.';
    return res.status(500).render('admin/login', { errMessage });
  }
};

export const getDashboard = async (req, res) => {
  console.log("entering dashboard");
  try {
    res.set({
      'Cache-Control': 'no-cache, no-store, must-revalidate, private',
      'Pragma': 'no-cache',
      'Expires': '0'
    });

    const admin=req.session.admin;
    console.log('Rendering dashboard for admin:', admin.email || 'Unknown');
    res.render('admin/dashboard');
  } catch (err) {
    console.error('Dashboard render error:', err);
    res.render('error/500', { title: 'Server Error' });
  }
};

export const logout = (req, res) => {
  try {
    res.set({
      'Cache-Control': 'no-cache, no-store, must-revalidate, private',
      'Pragma': 'no-cache',
      'Expires': '0'
    });

    if (req.session) {
      req.session.destroy((err) => {
        if (err) {
          console.error('Error destroying session during admin logout:', err);
          return res.render('error/500', { title: 'Server Error' });
        }
      
        
        res.redirect('/admin/login');
      });
    } else {
      res.redirect('/admin/login');
    }
  } catch (err) {
    console.error('Error in admin logout:', err);
    res.render('error/500', { title: 'Server Error' });
  }
};
// Default export for compatibility
export default {
  getLogin,
  postLogin,
  getDashboard,
  logout
};