import mongoose from 'mongoose';
const { Schema, model } = mongoose;

const companySchema = new Schema({
    "name": String,
    "logoUrl": String,
    "employees": Number,
    "turnover": Schema.Types.Mixed ,
    "sector": [String],
    "region": [String],
});
const Company = model('Company', companySchema);
export default Company;