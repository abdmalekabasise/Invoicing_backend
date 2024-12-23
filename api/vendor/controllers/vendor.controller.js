const vendorModel = require("../models/vendor.model");
const ledgerModel = require("../../ledger/models/ledger.model");
const response = require("../../../response");
const verify = require("../../../verify.token");
const resUpdate = require("../../common/date");
const mongoose = require("mongoose");
var data;

exports.create = async (req, res) => {
  try {
    var request = req.body;
    const auth_user = verify.verify_token(req.headers.token).details;

    try {
      console.log("request.balanceType.length :", request.balanceType.length);
      const vendorrec = await vendorModel.create({
        vendor_name: request.vendor_name,

        vendor_email: request.vendor_email,
        vendor_phone: request.vendor_phone,
        balance: request.balance,
        billingAddress: {
          name: request.billingAddress?.name || "",
          addressLine1: request.billingAddress?.addressLine1 || "",
          addressLine2: request.billingAddress?.addressLine2 || "",
          city: request.billingAddress?.city || "",
          state: request.billingAddress?.state || "",
          pincode: request.billingAddress?.pincode || "",
          country: request.billingAddress?.country || "",
        },
        balanceType: request.balanceType,
        user_id:
          auth_user.role === "Super Admin" ? auth_user.id : auth_user.userId,
        isDeleted: false,
        created_at: new Date(),
        mat_fisc: request.mat_fisc,
      });
      if (vendorrec) {
        data = {
          message: "Vendor Created successfully.",
          auth: true,
        };
        response.success_message(data, res);
      }
    } catch (err) {
      data = { message: err.message };
      response.validation_error_message(data, res);
    }
  } catch (error) {
    console.log("error :", error);
    response.error_message(error.message, res);
  }
};

exports.list = async function (req, res) {
  const auth_user = verify.verify_token(req.headers.token).details;
  try {
    const request = req.query;
    let filter = {};
    filter.isDeleted = false;
    filter.user_id =
      auth_user.role === "Super Admin" ? auth_user.id : auth_user.userId;

    if (request.vendor) {
      let splittedVal = request.vendor.split(",").map((id) => {
        return mongoose.Types.ObjectId(id);
      });
      filter._id = { $in: splittedVal };
    }
    if (request.search_vendor) {
      filter.vendor_name = {
        $regex: `^${request.search_vendor}`,
        $options: "i",
      };
    }
    const vendorRecordsCount = await vendorModel.find(filter).count();
    const vendorRec = await vendorModel
      .find(filter)
      .skip(request.skip)
      .limit(request.limit)
      .sort({ _id: -1 })
      .lean();
    for (const item of vendorRec) {
      item.created_at = resUpdate.resDate(item.created_at);
      const ledgerAmount = await ledgerModel.aggregate([
        {
          $match: {
            vendorId: mongoose.Types.ObjectId(item._id),
            user_id:
              auth_user.role === "Super Admin"
                ? mongoose.Types.ObjectId(auth_user.id)
                : mongoose.Types.ObjectId(auth_user.userId),
          },
        },
        {
          $group: {
            _id: "$mode",
            amount: {
              $sum: "$amount",
            },
          },
        },
      ]);
      let creditAmount = 0;
      let debitAmount = 0;

      if (item.balanceType == "Credit") {
        creditAmount += item.balance;
      } else if (item.balanceType == "Debit") {
        debitAmount += item.balance;
      }
      for (const item of ledgerAmount) {
        item._id == "Credit"
          ? (creditAmount += item.amount)
          : (debitAmount += item.amount);
      }
      item.balance = creditAmount - debitAmount;
    }

    response.success_message(vendorRec, res, vendorRecordsCount);
  } catch (error) {
    console.log("error :", error);
    response.error_message(error.message, res);
  }
};

exports.view = async (req, res) => {
  const auth_user = verify.verify_token(req.headers.token).details;
  try {
    const vendorinfo = await vendorModel
      .findOne({
        _id: req.params.id,
        user_id:
          auth_user.role === "Super Admin" ? auth_user.id : auth_user.userId,
      })
      .select("-__v -updated_at");

    if (vendorinfo) {
      data = {
        vendor_details: vendorinfo,
      };
      response.success_message(vendorinfo, res);
    } else {
      data = {
        vendor_details: [],
        message: "No result found",
      };
      data.createdAt = resUpdate.resDate(data.createdAt);
      response.success_message(data, res);
    }
  } catch (error) {
    console.log("error :", error);
    response.error_message(error.message, res);
  }
};

exports.update = async (req, res) => {
  const auth_user = verify.verify_token(req.headers.token).details;
  try {
    var request = req.body;
    var newvalues = {
      $set: {
        vendor_name: request.vendor_name,
        vendor_email: request.vendor_email,
        vendor_phone: request.vendor_phone,
        balance: request.balance,
        billingAddress: {
          name: request.billingAddress?.name || "",
          addressLine1: request.billingAddress?.addressLine1 || "",
          addressLine2: request.billingAddress?.addressLine2 || "",
          city: request.billingAddress?.city || "",
          state: request.billingAddress?.state || "",
          pincode: request.billingAddress?.pincode || "",
          country: request.billingAddress?.country || "",
        },
        balanceType: request.balanceType,
        mat_fisc: request.mat_fisc,
        user_id:
          auth_user.role === "Super Admin" ? auth_user.id : auth_user.userId,
      },
    };

    const vendorec = await vendorModel.findByIdAndUpdate(
      req.params.id,
      newvalues
    );
    if (vendorec) {
      data = { message: "vendor updated successfully." };
      response.success_message(data, res);
    }
  } catch (error) {
    console.log("error :", error);
    response.error_message(error.message, res);
  }
};

exports.softDelete = async (req, res) => {
  const auth_user = verify.verify_token(req.headers.token).details;
  try {
    const vendor = await vendorModel.findOneAndUpdate(
      {
        _id: req.params.id,
        isDeleted: { $ne: true },
        user_id:
          auth_user.role === "Super Admin" ? auth_user.id : auth_user.userId,
      },
      { $set: { isDeleted: true } }
    );
    data = { message: "Deleted Successfully", deletedCount: 1 };
    response.success_message(data, res);
  } catch (error) {
    data = { message: error.message };
    response.validation_error_message(data, res);
  }
};
