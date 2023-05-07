import mongoose from 'mongoose';
const { Schema, model } = mongoose;

const afSchema = new Schema({
    "components": Schema.Types.Mixed
},{strict: false});
const AssessmentFramework = model('AssessmentFramework', afSchema);
export default AssessmentFramework;