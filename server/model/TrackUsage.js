
import mongoose from 'mongoose';
const { Schema, model } = mongoose;

const TrackUsageSchema = new Schema({
    "usageId": String,
    "functioName": String,
    "resource": String,
    "data": Schema.Types.Mixed,
    "usage": Number,
    "units": String,
    createdAt: { type: Date, default: Date.now }
},{strict: false});
const TrackUsage = model('TrackUsage', TrackUsageSchema);
export default TrackUsage;