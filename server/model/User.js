import mongoose from 'mongoose';
const { Schema, model } = mongoose;

const userSchema = new Schema({
    "name": String,
    "email": String,
    "avatarUrl": String,
    "workspaces": Array,
},{
    strict: false
});
const User = model('User', userSchema);
export default User;