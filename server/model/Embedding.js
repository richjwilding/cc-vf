
import mongoose from 'mongoose';
const { Schema, model } = mongoose;

const embeddingSchema = new Schema({
    "type": String,
    "foreignId": String,
    "embeddings": Schema.Types.Mixed
},{strict: false});
const Embedding = model('Embedding', embeddingSchema);
export default Embedding;