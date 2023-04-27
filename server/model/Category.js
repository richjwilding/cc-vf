import mongoose from 'mongoose';
const { Schema, model } = mongoose;

const categorySchema = new Schema({
    "title": String,
    "description": String,
    "icon": String,
    "parameters": Schema.Types.Mixed
},{strict: false});
const Category = model('Category', categorySchema);
export default Category;