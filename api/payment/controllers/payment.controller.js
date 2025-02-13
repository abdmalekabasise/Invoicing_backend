const paymentModel = require("../models/payment.model");
const invoiceModel = require("../../invoice/models/invoice.model");
const customerModel = require("../../customers/models/customers.model");
const response = require("../../../response");
const verify = require("../../../verify.token");
const mongoose = require("mongoose");
const resUpdate = require("../../common/date");
const authModel = require("../../auth/models/auth.model");
const planModel = require("../../auth/models/plan.model");
const { default: axios } = require("axios");
const moment = require('moment');

exports.create = async (req, res) => {
  try {
    const request = req.body;
    const authUser = verify.verify_token(req.headers.token).details;
    let invoiceAmount = 0;
    let paidAmount = 0;
    let balanceAmount = 0;
    const filter = {
      _id: request.invoiceId,
      isDeleted: false,
    };
    const invoiceRec = await invoiceModel.findOne(filter);
    invoiceAmount = parseFloat(invoiceRec.TotalAmount);
    const paymentRec = await paymentModel.aggregate([
      {
        $match: {
          invoiceId: mongoose.Types.ObjectId(request.invoiceId),
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
    balanceAmount = invoiceAmount - paidAmount;
    if (balanceAmount < parseFloat(request.amount)) {
      response.validation_error_message(
        {
          message: ["you are paying more than balance amount"],
        },
        res
      );
    } else {
      let status = "PAID";
      if (balanceAmount > request.amount) {
        status = "PARTIALLY_PAID";
      }
      const invoiceRecord = await invoiceModel.findByIdAndUpdate(
        request.invoiceId,
        {
          $set: {
            status: status,
          },
        }
      );
      const paymentRecord = await paymentModel.create({
        invoiceId: request.invoiceId,
        invoiceAmount: invoiceAmount,
        received_on: request.received_on,
        payment_method: request.payment_method,
        amount: request.amount,
        notes: request.notes,
        status: status,
        userId: authUser.id,
        created_at: new Date(),
      });

      response.success_message(
        { message: "Payment Created successfully.", auth: true },
        res
      );
    }
  } catch (error) {
    response.error_message(error.message, res);
    console.log("error :", error);
  }
};

// update status
exports.update_status = async (req, res) => {
  try {
    var request = req.body;
    var newvalues = {
      $set: {
        status: request.status,
      },
    };
    const updStatus = await paymentModel.findByIdAndUpdate(
      req.params.id,
      newvalues
    );
    if (updStatus) {
      data = { message: "Status updated successfully." };
      response.success_message(data, res);
    }
  } catch (error) {
    console.log("error :", error);
    response.error_message(error.message, res);
  }
};

//view individual payment
exports.view = function (req, res) {
  paymentModel
    .findOne({ _id: req.params.id })
    .select("-__v -updated_at")
    .exec(function (err, paymentinfo) {
      if (err) {
        data = { message: err._message };
        response.validation_error_message(data, res);
      } else {
        if (paymentinfo) {
          data = {
            payment_details: paymentinfo,
          };
          response.success_message(data, res);
        } else {
          data = {
            payment_details: [],
            message: "No result found",
          };
          response.success_message(data, res);
        }
      }
    });
};

// list the payment
exports.list = async function (req, res) {
  const request = req.query;
  const authUser = verify.verify_token(req.headers.token).details;

  let paymentRecordsCount = await paymentModel
    .find({
      userId: authUser.role === "Super Admin" ? authUser.id : authUser.userId,
    })
    .lean();
  console.log(paymentRecordsCount);

  for (const item of paymentRecordsCount) {
    let customerDetail = await invoiceModel
      .findById(item.invoiceId)
      .populate("customerId")
      .lean();
    item.customerDetail = customerDetail.customerId;
    item.invoiceNumber = customerDetail.invoiceNumber;
  }
  let filteredResultsCount;
  if (request.customer) {
    let customerArr = request.customer.split(",");

    const filteredResult = paymentRecordsCount.filter((resItem) => {
      return customerArr.includes(resItem.customerDetail._id.toString());
    });
    filteredResultsCount = filteredResult.length;
  }
  paymentRecordsCount = paymentRecordsCount.length;

  let result = await paymentModel
    .find({
      userId: authUser.role === "Super Admin" ? authUser.id : authUser.userId,
    })
    .sort({ _id: -1 })
    .skip(request.skip)
    .limit(request.limit)
    .lean();

  for (const item of result) {
    let customerDetail = await invoiceModel
      .findById(item.invoiceId)
      .populate("customerId")
      .lean();
    if (customerDetail.customerId.image != "") {
      customerDetail.customerId.image = `${process.env.DEVLOPMENT_BACKEND_URL}/${customerDetail.customerId.image}`;
    }
    item.customerDetail = customerDetail.customerId;
    item.invoiceNumber = customerDetail.invoiceNumber;
    item.currency = customerDetail.currency;
  }
  if (request.customer) {
    let customerArr = request.customer.split(",");

    const filteredResult = result.filter((resItem) => {
      return customerArr.includes(resItem.customerDetail._id.toString());
    });

    response.success_message(filteredResult, res, filteredResultsCount);
  } else {
    response.success_message(result, res, paymentRecordsCount);
  }
};

//delete the payment
exports.softDelete = async (req, res) => {
  try {
    const payment_model = await paymentModel.findOneAndUpdate(
      { _id: req.params.id, isDeleted: { $ne: true } },
      { $set: { isDeleted: true } }
    );
    data = { message: "Deleted Successfully", deletedCount: 1 };
    response.success_message(data, res);
  } catch (error) {
    data = { message: error.message };
    response.validation_error_message(data, res);
  }
};
exports.createCheckout = async (req, res) => {
  let email;
  const auth_user = verify.verify_token(req.headers.token).details;

  if (auth_user.role === "Super Admin") {
    email = auth_user.email;
    console.log("email::", email);
  } else {
    return res.status(403).send("Error");
  }
  const type = req.body.type;
  let amount;
  let plan;
  if (type !== "Month" && type !== "Year") {
    return res.status(401).send("Error");
  }
  if (type === "Month") {
    amount = 19900;
    plan = "Month_Pn"
  }
  if (type === "Year") {
    amount = 199000;
    plan = "Year_Pn"
  }
  const headers = {
    'Content-Type': 'application/json',
    'x-api-key': `${process.env.KONNECT_API}` // Replace with your token
  };
  const body = {
    receiverWalletId: "67aa958591191821405fef00",
    token: "TND",
    amount: amount,
    type: "immediate",
    description: "SoftFacture",
    acceptedPaymentMethods: ["wallet", "bank_card", "e-DINAR"],
    lifespan: 15,
    checkoutForm: false,
    addPaymentFeesToAmount: true,
    email: email,
    orderId: plan,
    webhook: "https://merchant.tech/api/notification_payment",
    silentWebhook: true,
    successUrl: process.env.DEVLOPMENT_FRONTEND_URL,
    failUrl: process.env.DEVLOPMENT_FRONTEND_URL,
    theme: "light"
  }
  try {
    const KonnectResponse = await axios.post(`${process.env.KONNECT_URL}/payments/init-payment`, body, { headers });
    console.log(KonnectResponse);
    return response.success_message(KonnectResponse.data.payUrl, res);
  } catch (error) {
    console.log("***********************");
    console.log("error:::", error);
    return res.status(401).send(error.response ? error.response.data : error.message);
  }

}

exports.webhook = async (req, res) => {
  const paymentRef = req.query.payment_ref;
  try {
    const konnectApi = await axios.get(`${process.env.KONNECT_URL}/payments/${paymentRef}`);
    if (konnectApi.data.payment && konnectApi.data.payment.status === "completed") {
      const user = await authModel.findOne({ email: konnectApi.data.payment.paymentDetails.email });
      const plan = await planModel.findOne({ userId: user._id });
      if (konnectApi.data.payment.orderId === "Month_Pn") {
        plan.subscription_expiry = moment().add(1, 'months').toDate();
        plan.name = "Month plan";
        plan.type = "Month";
        price_per_month = konnectApi.data.payment.amount;

        await plan.save();

      }
      if (konnectApi.data.payment.orderId === "Year_Pn") {
        plan.subscription_expiry = moment().add(1, 'years').toDate();
        plan.name = "Year plan";
        plan.type = "Year";
        price_per_month = konnectApi.data.payment.amount;
        await plan.save();
      }
      return res.json(true);

    }
    return res.json(false);
  } catch (err) {
    console.log(err);
  }



}
