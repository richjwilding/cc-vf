// model/User.js
import mongoose from 'mongoose'
import passportLocalMongoose from 'passport-local-mongoose';
import bcrypt from 'bcrypt'

const SALT_ROUNDS = 12

const UserSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  name: String,
  avatarUrl: String,
  workspaces: [ ],
  googleId: {
    type: String,
    default: null
  },
  passwordHash: {
    type: String,
    default: null
  },
  accessToken: String,
  refreshToken: String,
  expiry_date: String,
  resetPasswordToken: String,
  resetPasswordExpires: Date,
}, {
  timestamps: true,
  strict: false
})

// Tell passport‐local‐mongoose to use `email` as the “username” field:
UserSchema.plugin(passportLocalMongoose, {
  usernameField: 'email',
});

// Export the model:
export default mongoose.model('User', UserSchema);