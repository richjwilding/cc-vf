import mongoose from 'mongoose';
const { Schema, model } = mongoose;

const contactSchema = new Schema({
    "name": String,
    "profile": String,
    "avatarUrl": String,
    "expertise": [String],
    "domains": [String]
});
const Contact = model('Contact', contactSchema);
export default Contact;