
import mongoose from 'mongoose';
const { Schema, model } = mongoose;

const contentEmbeddingSchema = new Schema({
    "part": Number,
    "foreignId": String,
    "text": String,
    "embeddings": Schema.Types.Mixed
},{strict: false});
const ContentEmbedding = model('ContentEmbedding', contentEmbeddingSchema);
export default ContentEmbedding;