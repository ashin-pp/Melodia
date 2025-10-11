const express = require('express');
const path = require('path');
const dotenv = require('dotenv');
const session = require('express-session');
const flash = require('connect-flash');
const mongoose = require('mongoose');
const app = express();
const userRoutes = require('./routes/userRoutes');
const adminRoutes = require('./routes/adminRoutes');
const { getImageUrl } = require('./helper/imageHandler');
const connectDB=require('./config/mongo')
dotenv.config();

require('./config/passport');
const passport = require('passport');

connectDB();

// Express middleware setup
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.locals.getImageUrl = getImageUrl;

// Disable ETag/304 caching and enforce no-store for dynamic pages
app.disable('etag');
app.set('etag', false);

// Cache-control for dynamic pages only
app.use((req, res, next) => {
  // Only apply no-cache to HTML pages, not static assets
  if (!req.path.match(/\.(css|js|png|jpg|jpeg|gif|ico|svg)$/)) {
    res.set({
      'Cache-Control': 'no-cache, must-revalidate',
      'Pragma': 'no-cache'
    });
  }
  next();
});


app.use(session({
  secret: 'your-secret-key-here',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false,
    maxAge: 24 * 60 * 60 * 1000,  // 1 day
    httpOnly: true,
  }
}));

app.use(passport.initialize());
app.use(passport.session());

app.use(flash());



// Logging middleware AFTER session
app.use((req, res, next) => {
  console.log(req.url, "url<<<")
  console.log(req.method, "<method<<");
  console.log(req.body, "body<<<<");
  next()
});



app.set('view engine', 'ejs');
app.set('views', 'views');

app.use((req, res, next) => {
  if (req.session && req.session.admin) {
    // Only redirect if trying to access user routes, not static assets or other paths
    if (req.originalUrl.startsWith('/user') || req.originalUrl === '/') {
      return res.redirect('/admin/dashboard');
    }
  }
  next();
});

// app.use('/user', userRoutes);
app.use('/admin', adminRoutes);
app.use('/', userRoutes);





// Error handling
app.use((req, res) => {
  res.status(404).render('error/404', { title: '404 Not Found' });
});
app.use((err, req, res, next) => {
  console.error('Global error handler:', err);
  res.status(500).render('error/500', { title: 'Server Error' });
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Server is running on port http://localhost:${port}`);
});