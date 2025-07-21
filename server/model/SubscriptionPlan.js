// model/User.js
import { model, Schema } from 'mongoose'


const SubscriptionPlanSchema = new Schema({
    name: {
      type: String,
    },
    description: {
      type: String,
    },
    creditsPerPeriod: {
      type: Number,
    },
    rollover: {
      type: Boolean,
      default: false,
    },
    active: {
      type: Boolean,
      default: false,
    },
    stripe:{},
    restrictions: {},
}, {
  timestamps: true, // adds createdAt / updatedAt
  strict: false
});

const SubscriptionPlan = model('SubscriptionPlan', SubscriptionPlanSchema);
export default SubscriptionPlan