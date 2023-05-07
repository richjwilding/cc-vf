import mongoose from 'mongoose';
const { Schema, model } = mongoose;

const counterSchema = new Schema({
    "name": String,
    "sequence_value": Number,
});
const Counter = model('Counter', counterSchema);
export default Counter;