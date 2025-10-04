import mongoose from 'mongoose';

const { Schema, model } = mongoose;

const integrationAccountSchema = new Schema(
  {
    provider: { type: String, required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    workspaceId: { type: Schema.Types.ObjectId, ref: 'Workspace', required: true },
    accessToken: { type: String, required: true },
    refreshToken: { type: String },
    expiresAt: { type: Date },
    scope: [{ type: String }],
    metadata: Schema.Types.Mixed,
  },
  {
    timestamps: true,
    strict: false,
  }
);

integrationAccountSchema.methods.toSafeObject = function toSafeObject() {
  return {
    id: this._id.toString(),
    provider: this.provider,
    userId: this.userId?.toString?.() ?? this.userId,
    workspaceId: this.workspaceId?.toString?.() ?? this.workspaceId,
    scope: this.scope ?? [],
    expiresAt: this.expiresAt ?? null,
    metadata: this.metadata ?? {},
    createdAt: this.createdAt,
    updatedAt: this.updatedAt,
  };
};

const IntegrationAccount = model('IntegrationAccount', integrationAccountSchema);

export default IntegrationAccount;
