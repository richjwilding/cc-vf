
import mongoose from 'mongoose';
const { Schema, model } = mongoose;

const documentIndexSchema = new Schema({
    "type": String,
    "foreignId": String,
    "version": { type: Number, default: 0 },
    "index": Schema.Types.Mixed
},{strict: false});
const DocumentIndex = model('DocumentIndex', documentIndexSchema);
export default DocumentIndex;