import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import session from 'express-session';
import flash from 'connect-flash';
import MongoStore from 'connect-mongo';
import userRoutes from './routes/userRoutes.js';
import adminRoutes from './routes/adminRoutes.js';
import { getImageUrl } from './helper/imageHandler.js';
import connectDB from './config/mongo.js';
import './config/passport.js';
import passport from 'passport';

const app = express();
dotenv.config();

connectDB();

// Express middleware setup
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.locals.getImageUrl = getImageUrl;

// Disable ETag/304 caching and enforce no-store for dynamic pages
app.disable('etag');
app.set('etag', false);


app.use(session({
  secret: process.env.SESSION_SECRET || 'your-secret-key-here',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({
    mongoUrl: process.env.MONGODB_URI || 'mongodb://localhost:27017/melodia',
    touchAfter: 24 * 3600,
    ttl: 7 * 24 * 60 * 60
  }),
  cookie: {
    secure: false,
    maxAge: 7 * 24 * 60 * 60 * 1000,
    httpOnly: true,
    sameSite: 'lax'
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

// Prevent admin users from accessing user routes
app.use((req, res, next) => {
  if (req.session && req.session.admin) {
    // If admin is trying to access user routes, redirect to admin dashboard
    if (req.originalUrl.startsWith('/user') || req.originalUrl === '/' || req.originalUrl === '/login' || req.originalUrl === '/signUp') {
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