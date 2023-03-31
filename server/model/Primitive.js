import mongoose from 'mongoose';
const { Schema, model } = mongoose;

const primitiveSchema = new Schema({
    "type": String,
    "state": String,
    "plainId": Schema.Types.Number,
    "referenceId": Number,
    "resources": Schema.Types.Mixed,
    "primitives": Schema.Types.Mixed,
    "metrics": Schema.Types.Mixed,
    "referenceParameters": Schema.Types.Mixed,
    "users": Schema.Types.Mixed,
    "title": String,
    doDiscovery: Boolean,
    metrics: Schema.Types.Mixed,
    evidenceAggregate: Schema.Types.Mixed,
    evidencePrompts: Schema.Types.Mixed,
    comments:[
        {
            user: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'User'
            },
            date: Date,
            body: String
        }
    ]
},{
    strict: false
});
const Primitive = model('Primitive', primitiveSchema);
export default Primitive;