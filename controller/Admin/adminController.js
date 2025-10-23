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

    const admin = req.session.admin;
    console.log('Rendering dashboard for admin:', admin.email || 'Unknown');
    
    // Get dashboard statistics
    const stats = await getDashboardStats();
    
    res.render('admin/dashboard', { stats });
  } catch (err) {
    console.error('Dashboard render error:', err);
    res.render('error/500', { title: 'Server Error' });
  }
};

// Function to get dashboard statistics
const getDashboardStats = async () => {
  try {
    // Import models
    const Order = (await import('../../model/orderSchema.js')).default;
    const User = (await import('../../model/userSchema.js')).default;
    
    // Get total users count
    const totalUsers = await User.countDocuments({ isBlocked: false });
    
    // Get total orders count
    const totalOrders = await Order.countDocuments();
    
    // Get delivered orders count
    const deliveredOrders = await Order.countDocuments({ orderStatus: 'Delivered' });
    
    // Get pending orders count
    const pendingOrders = await Order.countDocuments({ 
      orderStatus: { $in: ['Pending', 'Confirmed', 'Processing'] } 
    });
    
    // Get cancelled orders count
    const cancelledOrders = await Order.countDocuments({ orderStatus: 'Cancelled' });
    
    // Get total sales (sum of delivered orders)
    const totalSalesResult = await Order.aggregate([
      { $match: { orderStatus: 'Delivered' } },
      { $group: { _id: null, totalSales: { $sum: '$totalAmount' } } }
    ]);
    const totalSales = totalSalesResult.length > 0 ? totalSalesResult[0].totalSales : 0;
    
    // Get this month's statistics for comparison
    const currentDate = new Date();
    const firstDayOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
    const lastMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1);
    const firstDayOfLastMonth = new Date(lastMonth.getFullYear(), lastMonth.getMonth(), 1);
    
    // This month's orders
    const thisMonthOrders = await Order.countDocuments({
      orderDate: { $gte: firstDayOfMonth }
    });
    
    // Last month's orders
    const lastMonthOrders = await Order.countDocuments({
      orderDate: { $gte: firstDayOfLastMonth, $lt: firstDayOfMonth }
    });
    
    // Calculate percentage change for orders
    const orderChange = lastMonthOrders > 0 
      ? ((thisMonthOrders - lastMonthOrders) / lastMonthOrders * 100).toFixed(1)
      : 0;
    
    // This month's sales
    const thisMonthSalesResult = await Order.aggregate([
      { $match: { 
        orderStatus: 'Delivered',
        orderDate: { $gte: firstDayOfMonth }
      }},
      { $group: { _id: null, totalSales: { $sum: '$totalAmount' } } }
    ]);
    const thisMonthSales = thisMonthSalesResult.length > 0 ? thisMonthSalesResult[0].totalSales : 0;
    
    // Last month's sales
    const lastMonthSalesResult = await Order.aggregate([
      { $match: { 
        orderStatus: 'Delivered',
        orderDate: { $gte: firstDayOfLastMonth, $lt: firstDayOfMonth }
      }},
      { $group: { _id: null, totalSales: { $sum: '$totalAmount' } } }
    ]);
    const lastMonthSales = lastMonthSalesResult.length > 0 ? lastMonthSalesResult[0].totalSales : 0;
    
    // Calculate percentage change for sales
    const salesChange = lastMonthSales > 0 
      ? ((thisMonthSales - lastMonthSales) / lastMonthSales * 100).toFixed(1)
      : 0;
    
    return {
      totalUsers,
      totalOrders,
      deliveredOrders,
      pendingOrders,
      cancelledOrders,
      totalSales,
      orderChange: {
        value: orderChange,
        isPositive: orderChange >= 0
      },
      salesChange: {
        value: Math.abs(salesChange),
        isPositive: salesChange >= 0
      }
    };
  } catch (error) {
    console.error('Error getting dashboard stats:', error);
    return {
      totalUsers: 0,
      totalOrders: 0,
      deliveredOrders: 0,
      pendingOrders: 0,
      cancelledOrders: 0,
      totalSales: 0,
      orderChange: { value: 0, isPositive: true },
      salesChange: { value: 0, isPositive: true }
    };
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