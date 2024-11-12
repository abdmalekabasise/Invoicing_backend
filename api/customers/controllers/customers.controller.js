const customersModel = require("../models/customers.model");
const response = require("../../../response");
const verify = require("../../../verify.token");
const mongoose = require("mongoose");
const path = require("path");
const fs = require("fs");
const invoiceModel = require("../../invoice/models/invoice.model");
const paymentModel = require("../../payment/models/payment.model");
const resUpdate = require("../../common/date");
const moment = require("moment");

var data;

exports.create = async (req, res) => {
  try {
    var request = req.body;
    const auth_user = verify.verify_token(req.headers.token).details;
    let query = {
      userId: auth_user.id,
      isDeleted: false,
      $or: [{ email: request.email }, { phone: request.phone }],
    };
    const customerrec = await customersModel.findOne(query);

    if (customerrec) {
      data = { message: "Customer Email or Phone Alredy Exists.." };
      response.validation_error_message(data, res);
    } else {
      let filePath = "";
      if (req.file) {
        filePath = req.file.path;
      }
      const val = {
        name: request.name,
        phone: request.phone,
        email: request.email,
        // currency: request.currency,
        website: request.website,
        notes: request.notes,
        image: filePath,
        billingAddress: {
          name: request.billingAddress?.name || "",
          addressLine1: request.billingAddress?.addressLine1 || "",
          addressLine2: request.billingAddress?.addressLine2 || "",
          city: request.billingAddress?.city || "",
          state: request.billingAddress?.state || "",
          pincode: request.billingAddress?.pincode || "",
          country: request.billingAddress?.country || "",
        },
        shippingAddress: {
          name: request.shippingAddress?.name || "",
          addressLine1: request.shippingAddress?.addressLine1 || "",
          addressLine2: request.shippingAddress?.addressLine2 || "",
          city: request.shippingAddress?.city || "",
          state: request.shippingAddress?.state || "",
          pincode: request.shippingAddress?.pincode || "",
          country: request.shippingAddress?.country || "",
        },
        bankDetails: {
          bankName: request.bankDetails ? request.bankDetails.bankName : " ",
          branch: request.bankDetails ? request.bankDetails.branch : " ",
          accountHolderName: request.bankDetails
            ? request.bankDetails.accountHolderName
            : " ",
          accountNumber: request.bankDetails
            ? request.bankDetails.accountNumber
            : " ",
          IFSC: request.bankDetails ? request.bankDetails.IFSC : " ",
        },
        userId: auth_user.id,
      };
      const customerrec = await customersModel.create(val);
      if (customerrec) {
        data = {
          message: "Customer Created successfully.",
          auth: true,
        };
        response.success_message(data, res);
      }
    }
  } catch (error) {
    console.log("error :", error);
    response.error_message(error.message, res);
  }
};

exports.list = async (req, res) => {
  try {
    const request = req.query;
    let query = [
      {
        $lookup: {
          from: "invoices",
          localField: "_id",
          foreignField: "customerId",
          as: "invoices",
        },
      },
      {
        $match: {
          isDeleted: false,
        },
      },
      {
        $sort: {
          _id: -1,
        },
      },
    ];

    if (request.customer) {
      let splittedVal = request.customer.split(",").map((id) => {
        return mongoose.Types.ObjectId(id);
      });
      query[1].$match._id = { $in: splittedVal };
    }
    if (request.search_customer) {
      query[1].$match.name = {
        $regex: `^${request.search_customer}`,
        $options: "i",
      };
    }

    const customerRecordsCount = (await customersModel.aggregate(query)).length;

    if (request.skip) {
      query.push({ $skip: parseInt(request.skip) });
    }

    if (request.limit) {
      query.push({ $limit: parseInt(request.limit) });
    }

    const customerRec = await customersModel.aggregate(query);

    for (let item of customerRec) {
      if (item.image) {
        item.image = `${process.env.DEVLOPMENT_BACKEND_URL}/${item.image}`;
      }

      if (item.invoices.length > 0) {
        let balance = 0;
        let invoiceIds = [];

        for (const inv of item.invoices) {
          let paidAmount = 0;

          if (!invoiceIds.includes(inv._id)) {
            const paymentRec = await paymentModel.aggregate([
              {
                $match: {
                  invoiceId: mongoose.Types.ObjectId(inv._id),
                },
              },
              {
                $group: {
                  _id: null,
                  paidAmount: {
                    $sum: "$amount",
                  },
                },
              },
            ]);

            if (paymentRec.length > 0) {
              paidAmount += paymentRec[0].paidAmount;
            }

            balance += parseInt(inv.TotalAmount) - paidAmount;
            invoiceIds.push(inv._id);
          }
        }

        item.balance = balance;
        item.noOfInvoices = item.invoices.length;
      } else {
        item.balance = 0;
        item.noOfInvoices = 0;
      }

      item.createdAt = resUpdate.resDate(item.createdAt);
    }
    response.success_message(customerRec, res, customerRecordsCount);
  } catch (error) {
    console.log("Error:", error);
    response.error_message(error.message, res);
  }
};

exports.view = async (req, res) => {
  try {
    const customerinfo = await customersModel
      .findOne({ _id: req.params.id })
      .select("-__v -updated_at")
      .lean();
    if (customerinfo) {
      if (customerinfo.image) {
        customerinfo.image = `${process.env.DEVLOPMENT_BACKEND_URL}/${customerinfo.image}`;
      }
      data = {
        customer_details: customerinfo,
      };
      response.success_message(customerinfo, res);
    } else {
      data = {
        customer_details: [],
        message: "No result found",
      };
      response.success_message(data, res);
    }
  } catch (error) {
    console.log("error :", error);
    response.error_message(error.message, res);
  }
};

exports.update = async (req, res) => {
  try {
    const auth_user = verify.verify_token(req.headers.token).details;
    var request = req.body;

    const imageRec = await customersModel.findById(req.params.id);
    let newImage = imageRec.image;

    if (request.image == "remove") {
      newImage = "";
    }
    if (req.file && req.file.path) {
      newImage = req.file.path;

      if ((req.file && req.file.path) || request.image == "remove") {
        if (imageRec.image !== "" && fs.existsSync(imageRec.image)) {
          const rootDir = path.resolve("./");
          let oldImagePath = path.join(rootDir, imageRec.image);
          fs.unlinkSync(oldImagePath);
        }
      }
    }

    let newvalues = {
      $set: {
        name: request.name,
        phone: request.phone,
        email: request.email,
        // currency: request.currency,
        website: request.website,
        notes: request.notes,
        image: newImage,
        billingAddress: {
          name: request.billingAddress?.name || "",
          addressLine1: request.billingAddress?.addressLine1 || "",
          addressLine2: request.billingAddress?.addressLine2 || "",
          city: request.billingAddress?.city || "",
          state: request.billingAddress?.state || "",
          pincode: request.billingAddress?.pincode || "",
          country: request.billingAddress?.country || "",
        },
        shippingAddress: {
          name: request.shippingAddress?.name || "",
          addressLine1: request.shippingAddress?.addressLine1 || "",
          addressLine2: request.shippingAddress?.addressLine2 || "",
          city: request.shippingAddress?.city || "",
          state: request.shippingAddress?.state || "",
          pincode: request.shippingAddress?.pincode || "",
          country: request.shippingAddress?.country || "",
        },
        bankDetails: {
          bankName: request.bankDetails ? request.bankDetails.bankName : " ",
          branch: request.bankDetails ? request.bankDetails.branch : " ",
          accountHolderName: request.bankDetails
            ? request.bankDetails.accountHolderName
            : " ",
          accountNumber: request.bankDetails
            ? request.bankDetails.accountNumber
            : " ",
          IFSC: request.bankDetails ? request.bankDetails.IFSC : " ",
        },
        userId: auth_user.id,
      },
    };

    const dublicaterec = await customersModel.findOne({
      user_id: auth_user.id,
      $or: [{ email: request.email }, { phone: request.phone }],
      _id: { $ne: req.params.id },
    });

    data = { message: "Customer Email or Phone Already Exists.." };

    if (dublicaterec) {
      response.validation_error_message(data, res);
    } else {
      const cus = await customersModel.findByIdAndUpdate(
        req.params.id,
        newvalues
      );
      if (cus) {
        data = { message: "Customer updated successfully." };
        response.success_message(data, res);
      }
    }
  } catch (error) {
    console.log("Error:", error);
    response.error_message(error.message, res);
  }
};

exports.delete = async (req, res) => {
  try {
    const customerRec = await customersModel.findOneAndUpdate(
      { _id: req.body._id },
      { $set: { isDeleted: true } },
      { new: true }
    );
    if (customerRec) {
      data = { message: "customer deleted successfully." };
      response.success_message(data, res);
    }
  } catch (error) {
    console.log("error :", error);
    response.error_message(error.message, res);
  }
};

exports.activateCustomer = async (req, res) => {
  try {
    const customerRec = await customersModel.findByIdAndUpdate(
      req.body._id,
      {
        $set: {
          status: "Active",
        },
      },
      {
        new: true,
      }
    );
    if (customerRec) {
      data = { message: "customer activated successfully." };
      response.success_message(data, res);
    }
  } catch (error) {
    console.log("error :", error);
    response.error_message(error.message, res);
  }
};
exports.deactivateCustomer = async (req, res) => {
  try {
    const customerRec = await customersModel.findByIdAndUpdate(
      req.body._id,
      {
        $set: {
          status: "Deactive",
        },
      },
      {
        new: true,
      }
    );
    if (customerRec) {
      data = { message: "customer deactivated successfully." };
      response.success_message(data, res);
    }
  } catch (error) {
    console.log("error :", error);
    response.error_message(error.message, res);
  }
};
exports.CustomerDetails = async (req, res) => {
  try {
    const request = req.query;
    let skip = request.skip || null;
    let limit = request.limit || null;
    let data = {
      customerDetails: [],
      cardDetails: [],
    };
    let filter = [
      {
        $lookup: {
          from: "invoices",
          localField: "_id",
          foreignField: "customerId",
          as: "invoiceRecs",
        },
      },
      {
        $match: {
          _id: mongoose.Types.ObjectId(request._id),
        },
      },
      {
        $sort: {
          _id: 1,
        },
      },
    ];
    if (request.skip !== undefined) {
      query.push({ $skip: skip });
    }
    if (request.limit !== undefined) {
      query.push({
        $limit: limit,
      });
    }
    const customerRec = await customersModel.aggregate(filter);
    const pipeline = [
      [
        {
          $facet: {
            totalRecs: [
              {
                $match: {
                  customerId: mongoose.Types.ObjectId(request._id),
                  isDeleted: false,
                },
              },
              {
                $group: {
                  _id: null,
                  amount: {
                    $sum: { $toDouble: "$TotalAmount" },
                  },
                  count: {
                    $sum: 1,
                  },
                },
              },
            ],
            paidRecs: [
              {
                $match: {
                  customerId: mongoose.Types.ObjectId(request._id),
                  status: "PAID",
                  isDeleted: false,
                },
              },
              {
                $group: {
                  _id: null,
                  amount: {
                    $sum: { $toDouble: "$TotalAmount" },
                  },
                  count: {
                    $sum: 1,
                  },
                },
              },
            ],

            outStandingRecs: [
              {
                $match: {
                  customerId: mongoose.Types.ObjectId(request._id),
                  status: { $nin: ["PAID", "DRAFTED"] },
                  isDeleted: false,
                },
              },
              {
                $group: {
                  _id: null,
                  amount: {
                    $sum: { $toDouble: "$TotalAmount" },
                  },
                  count: {
                    $sum: 1,
                  },
                },
              },
            ],

            draftedRecs: [
              {
                $match: {
                  customerId: mongoose.Types.ObjectId(request._id),
                  dueDate: { $gt: moment(new Date()).format("DD-MM-YYYY") },
                  status: "DRAFTED",
                  isDeleted: false,
                },
              },
              {
                $group: {
                  _id: null,
                  amount: {
                    $sum: { $toDouble: "$TotalAmount" },
                  },
                  count: {
                    $sum: 1,
                  },
                },
              },
            ],
            cancelledRecs: [
              {
                $match: {
                  customerId: mongoose.Types.ObjectId(request._id),
                  status: "CANCELLED",
                  isDeleted: false,
                },
              },
              {
                $group: {
                  _id: null,
                  amount: {
                    $sum: { $toDouble: "$TotalAmount" },
                  },
                  count: {
                    $sum: 1,
                  },
                },
              },
            ],
            overDueRecs: [
              {
                $match: {
                  customerId: mongoose.Types.ObjectId(request._id),
                  status: { $nin: ["PAID", "PARTIALLY_PAID"] },
                  dueDate: { $lt: moment(new Date()).format("DD-MM-YYYY") },
                  isDeleted: false,
                },
              },
              {
                $group: {
                  _id: null,
                  amount: {
                    $sum: { $toDouble: "$TotalAmount" },
                  },
                  count: {
                    $sum: 1,
                  },
                },
              },
            ],
          },
        },
      ],
    ];
    const invoiceDetails = await invoiceModel.aggregate(pipeline);
    data.cardDetails = invoiceDetails;
    if (customerRec.length > 0) {
      if (customerRec[0].image) {
        customerRec[0].image = `${process.env.DEVLOPMENT_BACKEND_URL}/${customerRec[0].image}`;
      }
      for (const item of customerRec[0].invoiceRecs) {
        const paymentDetails = await paymentModel.aggregate([
          {
            $match: {
              invoiceId: mongoose.Types.ObjectId(item._id),
            },
          },
          {
            $group: {
              _id: null,
              paidAmount: {
                $sum: "$amount",
              },
            },
          },
        ]);
        if (paymentDetails.length > 0) {
          item.balance =
            parseFloat(item.TotalAmount) - paymentDetails[0].paidAmount;
          item.paidAmount = paymentDetails[0].paidAmount;
        } else {
          item.balance = item.TotalAmount;
          item.paidAmount = 0;
        }
      }
    }

    data.customerDetails = customerRec;
    response.success_message(data, res);
  } catch (error) {
    console.log("error :", error);
    response.error_message(error.message, res);
  }
};
