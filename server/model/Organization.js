// model/User.js
import { model, Schema } from 'mongoose'


const OrganizationSchema = new Schema({
  name: {
    type: String,
    required: true,
    trim: true,
  },
  companyUrl: {
    type: String,
    trim: true,
  },
  avatarUrl: {
    type: String,
    trim: true,
  },
  workspaces: [
    {
      type: Schema.Types.ObjectId,
      ref: 'Workspace',
    }
  ],
  credits: {
    type: Number,
    default: 0,
  },
  members: [{
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    role: {
      type: String,
      enum: ['owner','admin','editor','viewer'],
      default: 'viewer',
    }
  }],
  usage: [
    {
      // arbitrary JSON; you can replace Mixed with a tighter sub-schema if you know the shape
      type: Schema.Types.Mixed,
    }
  ],
  plan: {
    day: {
      type: Number,
    },
    name: {
      type: String,
    },
    creditsPerPeriod: {
      type: Number,
    },
    rollover: {
      type: Boolean,
      default: false,
    },
  },
  billing: {
    cost: {
      type: Number,
    },
    stripe: {
      type: String,
      trim: true,
    },
  },
}, {
  timestamps: true, // adds createdAt / updatedAt
  strict: false
});

const Organization = model('Organization', OrganizationSchema);
export default Organization