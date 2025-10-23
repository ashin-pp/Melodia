import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import User from '../model/userSchema.js';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

passport.use(new GoogleStrategy({
    clientID: process.env.clientID, // Fixed: use GOOGLE_CLIENT_ID
    clientSecret: process.env.clientSecret, // Fixed: use GOOGLE_CLIENT_SECRET
    callbackURL: `${process.env.APP_BASE_URL || 'http://localhost:3000'}/auth/google/callback`
},
async (accessToken, refreshToken, profile, done) => {
    try {
        console.log('Google OAuth Profile:', profile);
        
        // Check if user exists by googleId first
        let existingUser = await User.findOne({ googleId: profile.id });
        
        if (existingUser) {
            console.log('Existing Google user found:', existingUser.email);
            return done(null, existingUser);
        }
        
        // Check if user exists by email
        existingUser = await User.findOne({ email: profile.emails[0].value });
        
        if (existingUser) {
            // Link Google ID to existing account
            existingUser.googleId = profile.id;
            await existingUser.save();
            console.log('Linked Google ID to existing user:', existingUser.email);
            return done(null, existingUser);
        }
        
        // Create new user
        const hashedPassword = await bcrypt.hash(crypto.randomBytes(20).toString('hex'), 10);
        
        const newUser = new User({
            name: profile.displayName,
            email: profile.emails[0].value,
            googleId: profile.id,
            password: hashedPassword,
            role: 'user',
            isBlocked: false,
            isVerified: true // Google users are pre-verified
        });
        
        const savedUser = await newUser.save();
        console.log('New Google user created:', savedUser.email);
        return done(null, savedUser);
        
    } catch (err) {
        console.error('Error in Google Strategy:', err);
        return done(err, null);
    }
}));

passport.serializeUser((user, done) => {
    console.log('Serializing user:', user._id);
    done(null, user._id);
});

passport.deserializeUser(async (id, done) => {
    try {
        const user = await User.findById(id);
        console.log('Deserializing user:', user ? user.email : 'not found');
        done(null, user);
    } catch (err) {
        console.error('Error in deserializeUser:', err);
        done(err, null);
    }
});

export default passport;
