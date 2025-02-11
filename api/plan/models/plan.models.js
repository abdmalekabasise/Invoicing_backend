const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const planSchema = new mongoose.Schema(
  {
    name: {
      type: Schema.Types.String,
      required: true,
    },
    price_per_month: {
      type: Schema.Types.Number,
      required: true,
    },
    price_per_year_ttc: {
      type: Schema.Types.Number,
      required: true,
    },
    type: {
      type: Schema.Types.String,
      required: true,
    },
    subscription_expiry: {
      type: Schema.Types.Date,
      required: true,
    },

    userId: {
      type: Schema.Types.ObjectId,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("preferenceSettings", planSchema);
