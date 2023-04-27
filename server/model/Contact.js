import mongoose from 'mongoose';
const { Schema, model } = mongoose;

const contactSchema = new Schema({
    "name": String,
    "profile": String,
    "profileInfo": Object,
    "avatarUrl": String,
    "avatarPresent": Boolean,
    "expertise": [String],
    "domains": [String]
},{timestamps: true, strict: false});
const Contact = model('Contact', contactSchema);
export default Contact;