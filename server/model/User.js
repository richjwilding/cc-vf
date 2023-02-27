import mongoose from 'mongoose';
const { Schema, model } = mongoose;

const userSchema = new Schema({
    "name": String,
    "email": String,
    "avatarUrl": String,
});
const User = model('User', userSchema);
export default User;