import mongoose, { Document, Schema, Model } from "mongoose";

export interface IPropertyGroup extends Document {
  orgId: mongoose.Types.ObjectId;
  name: string;
  description?: string;
  color: string; // hex or tailwind token — used for group badge in UI
  listingIds: mongoose.Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

const PropertyGroupSchema = new Schema<IPropertyGroup>(
  {
    orgId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
    name: { type: String, required: true },
    description: { type: String },
    color: { type: String, default: "#6366f1" },
    listingIds: [{ type: Schema.Types.ObjectId, ref: "Listing" }],
  },
  { timestamps: true }
);

PropertyGroupSchema.index({ orgId: 1, name: 1 }, { unique: true });

export const PropertyGroup: Model<IPropertyGroup> =
  mongoose.models.PropertyGroup ??
  mongoose.model<IPropertyGroup>("PropertyGroup", PropertyGroupSchema);
