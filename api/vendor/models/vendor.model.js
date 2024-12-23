const mongoose = require("mongoose");
const mongoosePaginate = require("mongoose-paginate-v2");
const Schema = mongoose.Schema;

let vendor = new Schema({
  vendor_name: { type: String, required: true },
  vendor_email: { type: String, required: false },
  vendor_phone: { type: String, required: false },
  balance: { type: Number, min: 0, required: false },
  mat_fisc: {
    type: Schema.Types.String,
    required: false,
  },
  billingAddress: {
    name: {
      type: Schema.Types.String,
      required: false,
    },
    addressLine1: {
      type: Schema.Types.String,
      required: false,
    },
    addressLine2: {
      type: Schema.Types.String,
      required: false,
    },
    city: {
      type: Schema.Types.String,
      required: false,
    },
    state: {
      type: Schema.Types.String,
      required: false,
    },
    pincode: {
      type: Schema.Types.String,
      required: false,
    },
    country: {
      type: Schema.Types.String,
      required: false,
    },
  },
  balanceType: {
    type: String,
    required: false,
  },
  user_id: {
    type: Schema.Types.ObjectId,
    ref: "users",
    required: true,
  },
  status: { type: Boolean, default: 1 },
  created_at: { type: Date },
  updated_at: { type: Date, default: new Date() },
  isDeleted: { type: Boolean, default: false },
});

vendor.plugin(mongoosePaginate);
vendor.virtual("vendors_info", {
  ref: "vendors",
  localField: "contact",
  foreignField: "_id",
  justOne: true,
});

vendor.plugin(mongoosePaginate);
vendor.virtual("vendors_info", {
  ref: "vendors",
  localField: "contact",
  foreignField: "_id",
  justOne: true,
});

vendor.set("toObject", { virtuals: true });
vendor.set("toJSON", { virtuals: true });
module.exports = mongoose.model("vendor", vendor);
