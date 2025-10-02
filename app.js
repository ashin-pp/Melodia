const express = require('express');
const path = require('path');
const dotenv = require('dotenv');
const session = require('express-session');
const flash = require('connect-flash');
const mongoose = require('mongoose');
const app = express();
const userRoutes = require('./routes/userRoutes');
const adminRoutes=require('./routes/adminRoutes');
const { getImageUrl } = require('./helper/imageHandler');;
dotenv.config();

require('./config/passport');
const passport = require('passport');

mongoose.connect('mongodb://localhost:27017/melodia', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => {
  console.log('✅ Connected to MongoDB successfully');
})
.catch((error) => {
  console.error('❌ MongoDB connection error:', error.message);
  process.exit(1);
  
});

// Express middleware setup
app.use(express.json());
app.use(express.urlencoded({extended: true}));
app.use(express.static('public'));
app.locals.getImageUrl = getImageUrl;

// Disable ETag/304 caching and enforce no-store for dynamic pages
app.disable('etag');
app.set('etag', false);

// Global cache-control for all routes 
app.use((req, res, next) => {
  res.set({
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
    'Pragma': 'no-cache',
    'Expires': '0',
    'Surrogate-Control': 'no-store'
  });
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
app.use((req,res,next)=>{
  console.log(req.url,"url<<<")
  console.log(req.method,"<method<<");
  console.log(req.body,"body<<<<");
  next()
});



app.set('view engine', 'ejs');
app.set('views', 'views');

app.use((req, res, next) => {
  if (req.session && req.session.admin) {
    if (!req.originalUrl.startsWith('/admin')) {
      return res.redirect('/admin/dashboard');
    }
  }
  next();
});

app.use('/user', userRoutes);  // Mount with /user prefix
app.use('/admin',adminRoutes);
app.use('/', userRoutes);      // Also mount at root for landing page



// Error handling
app.use((req, res) => {
  res.status(404).render('error/404', { title: '404 Not Found' });
});
app.use((err, req, res, next) => {
  console.error('Global error handler:', err.stack);
  res.status(500).render('error/500', { title: 'Server Error' });
});

app.listen(3000, () => console.log(`Server running on port: http://localhost:3000`));
