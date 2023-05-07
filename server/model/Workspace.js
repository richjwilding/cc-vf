import mongoose from 'mongoose';
const { Schema, model } = mongoose;

const workspaceSchema = new Schema({
    "title": String,
    "description": String,
    "icon": String,
    "color": String,
    "users": Array
},{strict: false});
const Workspace = model('Workspace', workspaceSchema);
export default Workspace;