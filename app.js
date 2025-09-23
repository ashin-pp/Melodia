const express = require('express');
const path = require('path');
const dotenv = require('dotenv');
const session = require('express-session');
const flash = require('connect-flash');
const mongoose = require('mongoose');
const passport = require('passport');
const app = express();

// IMPROVED: MongoDB connection with error handling
mongoose.connect('mongodb://localhost:27017/melodia', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => {
  console.log('✅ Connected to MongoDB successfully');
})
.catch((error) => {
  console.error('❌ MongoDB connection error:', error.message);
  console.log('\n🔧 To fix this:');
  console.log('1. Make sure MongoDB is installed');
  console.log('2. Start MongoDB service: Run "services.msc" and start MongoDB service');
  console.log('3. Or start manually: Run "mongod" in command prompt as administrator');
  process.exit(1);
});

// Handle connection events
mongoose.connection.on('connected', () => {
  console.log('🟢 Mongoose connected to MongoDB');
});

mongoose.connection.on('error', (err) => {
  console.error('🔴 Mongoose connection error:', err);
});

mongoose.connection.on('disconnected', () => {
  console.log('🟡 Mongoose disconnected');
});

// Rest of your code remains the same...
app.use(session({
  secret: 'your-secret-key-here',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: false,
    maxAge: 24 * 60 * 60 * 1000  // 1 day
  } 
}));
app.use((req,res,next)=>{
  console.log(req.url)
  console.log(req.method);
  console.log(req.body);
  next()})

app.use(express.json());
app.use(express.urlencoded({extended: true}));
app.use(express.static('public'));
app.use(flash());
app.set('view engine', 'ejs');
app.set('views', 'views');

const userRoutes = require('./routes/userRoutes');
app.use('/', userRoutes);

// Middleware to prevent caching of restricted pages
app.use((req, res, next) => {
  res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.set('Pragma', 'no-cache');   
  res.set('Expires', '0');         
  next();
});

app.listen(3000, () => console.log(`🚀 Server running on port: http://localhost:3000`));
