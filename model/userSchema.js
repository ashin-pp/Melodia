import mongoose from 'mongoose';

const {Schema} = mongoose;

const userSchema = new Schema({
  name: {
    type: String,
    required: true
  },
  password: {
    type: String,
    required: false
  },
  email: {
    type: String,
    required: true,
    unique: true
  },
  phone: {
    type: String,
    required: false,
    unique: false,
    sparse: true,
    default: null
  },
  googleId: {
    type: String,
    unique: true,
    sparse: true
  },
  isBlocked: {
    type: Boolean,
    default: false
  },
  createdOn: {
    type: Date,
    default: Date.now
  },
  isAdmin: {
    type: Boolean,
    default: false
  },
   avatar:{type:Object},

     role: { 
      type: String, 
      enum: ['user', 'admin'], 
      default: 'user' 
    },
   
})

const User = mongoose.model('User', userSchema);

export default User;