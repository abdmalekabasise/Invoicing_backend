const invoiceModel = require("../models/invoice.model");
const inventoryModel = require("../../inventory/models/inventory.model");
const customersModel = require("../../customers/models/customers.model");
const creditnoteModel = require("../../credit_note/models/credit_note.model");
const invoiceSettingsModel = require("../../invoiceSettings/models/invoiceSettings.model");
const paymentModel = require("../../payment/models/payment.model");
const companySettingsModel = require("../../companySettings/models/companySetting.model");
const mailerConfig = require("../../../config/mailConfig");
const response = require("../../../response");
const verify = require("../../../verify.token");
var mongoose = require("mongoose");
const moment = require("moment");
const path = require("path");
//var pdf = require("dynamic-html-pdf");
var fs = require("fs");
const { ToWords } = require("to-words");
const companySettingModel = require("../../companySettings/models/companySetting.model");
var nodemailer = require("nodemailer");
const emailSettingModel = require("../../email_settings/models/email_settings.model");
const preferenceSettingsModel = require("../../preference_settings/models/preference_settings.models");
const mailSend = require("../../common/mailSend");
const { createTransporters } = require("../../common/mailSend");
const notification = require("../../notification/controllers/notification.controller");
const commonDate = require("../../common/date");
const customerModel = require("../../customers/models/customers.model");
const users = require("../../auth/models/auth.model");
const notificationModel = require("../../notification/models/notification.model");
const unauthorizedAPI = require("../../unauthorized_apis/controllers/unauthorized_apis.controller");
const DeliveryChallanModel = require("../../delivery_challans/models/delivery_challans.model");
const delivery_challansModel = require("../../delivery_challans/models/delivery_challans.model");
const puppeteer = require("puppeteer");
//"puppeteer": "^21.3.8",
const handlebars = require("handlebars");
const axios = require("axios");

const { join, resolve } = require("path");

var data;

exports.create = async (req, res) => {
  try {
    var request = req.body;
    const authUser = verify.verify_token(req.headers.token).details;
    const invoiceModelcount = await invoiceModel.find().count();
    let count = invoiceModelcount + 1;
    const bankValue = request.bank;
    const bankObjectId = bankValue ? mongoose.Types.ObjectId(bankValue) : null;

    let filesName = "";
    if (req.file) {
      filesName = req.file.path;
    }

    try {
      let minQuanProducts = [];
      for (const item of request.items) {
        const invRec = await inventoryModel.findOne({
          productId: item.productId,
        });
        if (invRec == null) {
          minQuanProducts.push(`${item.name} has only 0 quantity`);
        } else if (invRec.quantity < parseInt(item.quantity)) {
          minQuanProducts.push(
            `${item.name} has only ${invRec.quantity} quantity`
          );
        }
      }

      let renewalDates = [];
      if (request.isRecurring) {
        renewalDates = commonDate.calculateRenewalDates(
          request.invoiceDate,
          parseInt(request.recurringCycle)
        );
      }
      const invoiceSettings = await invoiceSettingsModel.find().lean();
      let status = "DRAFTED";
      if (request.payment_method == "Online") {
        status = "SENT";
      }
      let totalTnd = 0;
      console.log(request.signatureId);
      if (request.currency === "TND") {
        // If currency is TND, use the total amount directly
        totalTnd = parseFloat(request.TotalAmount).toFixed(2); // Convert string to number
      } else {
        // If currency is not TND, fetch the exchange rate
        try {
          const apiResponse = await axios.get(
            `https://api.exchangeratesapi.io/v1/latest?access_key=4233bd58c3b207056c466b8213b1864f&base=${request.currency}&symbols=TND`
          );

          // Extract the rate for TND from the API response
          const rate = apiResponse.data.rates.TND;

          // Convert TotalAmount from string to number and calculate the total amount in TND
          totalTnd = (parseFloat(request.TotalAmount) * rate).toFixed(2);
        } catch (error) {
          console.error("Error fetching exchange rate:", error.message);
          throw error; // Handle the error as needed
        }
      }
      const invoicerec = await invoiceModel.create(
        {
          customerId: request.customerId,
          invoiceDate: request.invoiceDate,
          dueDate: request.dueDate,
          renewalDates: renewalDates,
          invoiceNumber: request.invoiceNumber,
          referenceNo: request.referenceNo,
          payment_method: request.payment_method,
          items: request.items,
          selectedOtherTaxes: request.selectedOtherTaxes,
          selectedTaxRates: request.selectedTaxRates,

          currency: request.currency,
          notes: request.notes,
          bank: bankObjectId,
          termsAndCondition: request.termsAndCondition,
          taxable_amount: request.taxable_amount,
          sub_total: request.sub_total,
          sign_type: request.sign_type,
          signatureId:
            request.signatureId === "undefined" ? null : request.signatureId,
          signatureName: request.signatureName,
          signatureImage: request.sign_type === "eSignature" ? filesName : null,
          // signatureImage: filesName ? filesName : undefined,
          taxableAmount: request.taxableAmount,
          totalDiscount: request.totalDiscount,
          vat: request.vat,
          roundOff: request.roundOff,
          TotalAmount: request.TotalAmount,
          TotalAmountTnd: totalTnd.toString(), // Add TotalAmountTnd to the schema

          isRecurring: request.isRecurring,
          recurringCycle: request.recurringCycle ? request.recurringCycle : 0,
          total: request.total,
          userId:
            authUser.role === "Super Admin" ? authUser.id : authUser.userId,
          status: status,
          created_at: new Date(),
          isDeleted: false,
        },
        async function (err, invoiceDetails) {
          if (err) {
            data = { message: err.message };
            response.validation_error_message(data, res);
          } else {
            if (invoiceDetails) {
              await invoiceDetails.items.forEach(async (item) => {
                const inventoryRecord = await inventoryModel.findOne({
                  productId: item.productId,
                });
                if (inventoryRecord) {
                  let updatedQty = Math.max(
                    0,
                    inventoryRecord.quantity - parseInt(item.quantity)
                  );

                  const updatedRec = await inventoryModel.findByIdAndUpdate(
                    inventoryRecord._id,
                    {
                      $set: {
                        quantity: updatedQty,
                      },
                    }
                  );
                }
              });
              if (status == "SENT") {
                req.query.invoiceId = invoiceDetails._id;
                req.query.value = "invoiceController";
                await unauthorizedAPI.sentPaymentLinks(req, res);
              }

              const customerName = await customerModel.findById(
                request.customerId
              );
              const adminRole = await users.findOne({ role: "Super Admin" });

              let data = { message: "Invoice Created successfully." };

              if (authUser.role === "Super Admin") {
                // Send notification only to Super Admin if available
                if (adminRole) {
                  await notification.sendFCMMessage(
                    {
                      title: "Notification Message",
                      body: ` An invoice has been created for ${customerName.name}`,
                    },
                    [adminRole._id]
                  );
                } else {
                  console.log("Super Admin not found in the database");
                }
              } else if (authUser.role !== "Super Admin" && adminRole) {
                // Send notification to users who are not Super Admin but have the adminRole
                await notification.sendFCMMessage(
                  {
                    title: "Notification Message",
                    body: ` An invoice has been created for ${customerName.name}`,
                  },
                  [adminRole._id]
                );
              }

              response.success_message(data, res);
            } else {
              const errorMsg = { message: "Failed.", auth: true };
              response.error_message(errorMsg, res);
            }
          }
        }
      );
    } catch (err) {
      console.log("error :", err);
      data = { message: err.message };
      response.validation_error_message(data, res);
    }
  } catch (error) {
    console.log("error :", error);
    response.error_message(error.message, res);
  }
};

getcusidsbysearch = async (authUser, key) => {
  return new Promise((resolve, reject) => {
    customer_ids = [];
    customersModel
      .find({
        userId: authUser,
        customer_name: { $regex: key, $options: "i" },
      })
      .then((result) => {
        if (result.length > 0) {
          for (i = 0; i < result.length; i++) {
            customer_ids.push(result[i]._id);
          }
        }
        resolve(customer_ids);
      })
      .catch(function (error) {
        resolve(customer_ids);
      });
  });
};

// for dropdown
exports.customer_list = async (req, res) => {
  const authUser = verify.verify_token(req.headers.token).details;
  try {
    var filter = {};
    filter.isDeleted = false;
    filter.userId =
      authUser.role === "Super Admin" ? authUser.id : authUser.userId;
    if (req.query.name) filter = { $or: [] };
    if (req.query.name)
      filter.$or.push({
        customer_name: { $regex: req.query.name, $options: "i" },
      });

    console.log(filter);

    customersModel
      .find(filter)
      .select("_id customer_name")
      .then((result) => {
        response.success_message(result, res);
      });
  } catch (error) {
    console.log("error :", error);
    response.error_message(error.message, res);
  }
};

exports.list = async function (req, res) {
  const authUser = verify.verify_token(req.headers.token).details;
  try {
    let options = {};
    options.select = "-__v -updated_at";
    options.populate = [
      { path: "customerId", select: " -updated_at" },
      { path: "signatureId" },
    ];
    console.log("pl");

    options.sort = { _id: -1 };
    options.lean = true;
    var filter = {};
    filter.isDeleted = false;
    filter.isSalesReturned = false;
    filter.userId =
      authUser.role === "Super Admin" ? authUser.id : authUser.userId;
    const fromDateFilter = moment(req.query.fromDate);
    const endFDateFilter = moment(req.query.toDate);

    // Get only the date part
    const fromDateOnly = fromDateFilter.format("YYYY-MM-DD");
    const toDateOnly = endFDateFilter.format("YYYY-MM-DD");

    if (req.query.fromDate && req.query.toDate) {
      filter.invoiceDate = {
        $gte: new Date(`${fromDateOnly}T00:00:00.000Z`),
        $lte: new Date(`${toDateOnly}T23:59:59.999Z`),
      };
    }
    if (req.query.status == "DRAFTED") {
      filter.status = "DRAFTED";
    }
    if (
      req.query.status == "PAID" ||
      req.query.status == "PARTIALLY_PAID" ||
      req.query.status == "SENT" ||
      req.query.status == "CANCELLED"
    ) {
      filter.status = req.query.status;
    }
    if (req.query.status == "RECURRING") {
      filter.isRecurring = true;
    }
    if (req.query.status == "OVERDUE") {
      filter.status = { $nin: ["PAID", "PARTIALLY_PAID"] };
      filter.dueDate = {
        $lt: new Date(),
      };
    }
    if (req.query.search_invoiceNumber) {
      filter.invoiceNumber = {
        $regex: `^${req.query.search_invoiceNumber}`,
        $options: "i",
      };
    }
    if (req.query.customer) {
      let splittedVal = req.query.customer.split(",").map((id) => {
        return mongoose.Types.ObjectId(id);
      });
      filter.customerId = { $in: splittedVal };
    }
    if (req.query.invoiceNumber) {
      filter.invoiceNumber = { $in: req.query.invoiceNumber.split(",") };
    }
    let invoiceRecordsCount = await invoiceModel.paginate(filter, options);
    invoiceRecordsCount = invoiceRecordsCount.totalDocs;

    if (req.query.skip) {
      options.offset = parseInt(req.query.skip);
    }
    if (req.query.limit) {
      options.limit = parseInt(req.query.limit);
    }
    await invoiceModel.paginate(filter, options).then(async (result) => {
      let results = [];
      let status = ["PAID", "PARTIALLY_PAID", "SENT"];
      for (const item of result.docs) {
        if (Object.keys(item).length > 0) {
        }
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
          item.balance = parseFloat(item.TotalAmount);
          item.paidAmount = 0;
        }
        if (item.signatureImage) {
          item.signatureImage = `${process.env.DEVLOPMENT_BACKEND_URL}/${item.signatureImage}`;
        }
        if (item.signatureId && item.signatureId.signatureImage) {
          item.signatureId.signatureImage = `${process.env.DEVLOPMENT_BACKEND_URL}/${item.signatureId.signatureImage}`;
        }
        if (
          item.customerId &&
          item.customerId.image &&
          !item.customerId.image.startsWith("http")
        ) {
          item.customerId.image = `${process.env.DEVLOPMENT_BACKEND_URL}/${item.customerId.image}`;
        }
        if (!item.signatureId) {
          item.signatureId = {};
        }
        results.push(item);
      }

      response.success_message(results, res, invoiceRecordsCount);
    });
  } catch (error) {
    console.log("error :", error);
    response.error_message(error.message, res);
  }
};

// Card count function Start
exports.cardCount = async function (req, res) {
  const authUser = verify.verify_token(req.headers.token).details;
  try {
    var filter = {};
    let _ids = [];
    const invoiceRec = await invoiceModel.find({
      status: "PARTIALLY_PAID",
      userId: authUser.role === "Super Admin" ? authUser.id : authUser.userId,
    });
    for (const item of invoiceRec) {
      _ids.push(mongoose.Types.ObjectId(item._id));
    }
    const paymentRec = await paymentModel.aggregate([
      {
        $match: {
          invoiceId: { $in: _ids },
          userId: mongoose.Types.ObjectId(
            authUser.role === "Super Admin" ? authUser.id : authUser.userId
          ),
        },
      },
      {
        $group: {
          _id: null,
          paidAmount: { $sum: { $toDouble: "$amount" } },
        },
      },
    ]);
    var total_invoice = await invoiceModel.aggregate([
      {
        $match: {
          isSalesReturned: false,
          userId: mongoose.Types.ObjectId(
            authUser.role === "Super Admin" ? authUser.id : authUser.userId
          ),
        },
      },
      {
        $group: {
          _id: null,
          total_sum: { $sum: { $toDouble: "$TotalAmount" } },
          count: { $sum: 1 },
        },
      },
    ]);
    // New

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);
    console.log("startOfToday " + startOfToday + "endOfToday " + endOfToday);

    var total_invoice_today = await invoiceModel.aggregate([
      {
        $match: {
          isSalesReturned: false,
          userId: mongoose.Types.ObjectId(
            authUser.role === "Super Admin" ? authUser.id : authUser.userId
          ),
          invoiceDate: { $gte: startOfToday, $lte: endOfToday }, // Filter for today's invoices
        },
      },
      {
        $group: {
          _id: null,
          total_sum: { $sum: { $toDouble: "$TotalAmountTnd" } },
          count: { $sum: 1 },
        },
      },
    ]);

    const now = new Date();
    const day = now.getDay(); // 0 (Sunday) to 6 (Saturday)
    const diffToMonday = (day === 0 ? -6 : 1) - day; // Adjust for Sunday (0) being the last day of the previous week
    const startOfWeek = new Date(now.setDate(now.getDate() + diffToMonday));
    startOfWeek.setHours(0, 0, 0, 0);

    // Calculate end of the current week (Sunday)
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    endOfWeek.setHours(23, 59, 59, 999);

    var total_invoice_week = await invoiceModel.aggregate([
      {
        $match: {
          isSalesReturned: false,
          userId: mongoose.Types.ObjectId(
            authUser.role === "Super Admin" ? authUser.id : authUser.userId
          ),
          invoiceDate: { $gte: startOfWeek, $lte: endOfWeek }, // Filter for this week
        },
      },
      {
        $group: {
          _id: null,
          total_sum: { $sum: { $toDouble: "$TotalAmountTnd" } },
          count: { $sum: 1 },
        },
      },
    ]);

    // Calculate the start of the month
    const startOfMonth = new Date();
    startOfMonth.setDate(1); // Set to the first day of the month
    startOfMonth.setHours(0, 0, 0, 0); // Set time to start of the day

    // Calculate the end of the month
    const endOfMonth = new Date(startOfMonth);
    endOfMonth.setMonth(startOfMonth.getMonth() + 1); // Move to the next month
    endOfMonth.setDate(0); // Set to the last day of the current month
    endOfMonth.setHours(23, 59, 59, 999); // Set time to the end of the day

    // Aggregation for total invoices in the current month
    var total_invoice_month = await invoiceModel.aggregate([
      {
        $match: {
          isSalesReturned: false,
          userId: mongoose.Types.ObjectId(
            authUser.role === "Super Admin" ? authUser.id : authUser.userId
          ),
          invoiceDate: { $gte: startOfMonth, $lte: endOfMonth }, // Filter for this month
        },
      },
      {
        $group: {
          _id: null,
          total_sum: { $sum: { $toDouble: "$TotalAmountTnd" } },
          count: { $sum: 1 },
        },
      },
    ]);

    const today = new Date();
    const startOfCurrentYear = new Date(today.getFullYear(), 0, 1);
    const startOfLastYear = new Date(today.getFullYear() - 1, 0, 1);
    const endOfLastYearToToday = new Date(
      today.getFullYear() - 1,
      today.getMonth(),
      today.getDate()
    );
    console.log(endOfLastYearToToday);

    const totalThisYear = await invoiceModel.aggregate([
      {
        $match: {
          isSalesReturned: false,
          userId: mongoose.Types.ObjectId(
            authUser.role === "Super Admin" ? authUser.id : authUser.userId
          ),
          invoiceDate: { $gte: startOfCurrentYear, $lte: today },
        },
      },
      {
        $group: {
          _id: null,
          total_sum: { $sum: { $toDouble: "$TotalAmountTnd" } },
        },
      },
    ]);

    const totalLastYear = await invoiceModel.aggregate([
      {
        $match: {
          isSalesReturned: false,
          userId: mongoose.Types.ObjectId(
            authUser.role === "Super Admin" ? authUser.id : authUser.userId
          ),
          invoiceDate: { $gte: startOfLastYear, $lte: endOfLastYearToToday },
        },
      },
      {
        $group: {
          _id: null,
          total_sum: { $sum: { $toDouble: "$TotalAmountTnd" } },
        },
      },
    ]);

    // Calculate the difference
    const totalThisYearAmount = totalThisYear[0]?.total_sum || 0;
    const totalLastYearAmount = totalLastYear[0]?.total_sum || 0;
    const difference = totalThisYearAmount - totalLastYearAmount;

    var total_outstanding = await invoiceModel.aggregate([
      {
        $match: {
          status: { $nin: ["PAID", "DRAFTED", "SENT"] },
          isSalesReturned: false,
          userId: mongoose.Types.ObjectId(
            authUser.role === "Super Admin" ? authUser.id : authUser.userId
          ),
        },
      },
      {
        $group: {
          _id: null,
          total_sum: { $sum: { $toDouble: "$TotalAmount" } },
          count: { $sum: 1 },
        },
      },
    ]);
    if (paymentRec.length > 0 && total_outstanding.length > 0) {
      total_outstanding[0].total_sum =
        total_outstanding[0].total_sum - paymentRec[0].paidAmount;
    }
    var total_overdue = await invoiceModel.aggregate([
      {
        $match: {
          dueDate: { $lt: new Date() },
          status: { $nin: ["PAID", "PARTIALLY_PAID"] },
          isSalesReturned: false,
          userId: mongoose.Types.ObjectId(
            authUser.role === "Super Admin" ? authUser.id : authUser.userId
          ),
        },
      },
      {
        $group: {
          _id: null,
          total_sum: { $sum: { $toDouble: "$TotalAmount" } },
          count: { $sum: 1 },
        },
      },
    ]);
    var total_cancelled = await invoiceModel.aggregate([
      {
        $match: {
          status: "CANCELLED",
          userId: mongoose.Types.ObjectId(
            authUser.role === "Super Admin" ? authUser.id : authUser.userId
          ),
        },
      },
      {
        $group: {
          _id: null,
          total_sum: { $sum: { $toDouble: "$TotalAmount" } },
          count: { $sum: 1 },
        },
      },
    ]);
    var total_drafted = await invoiceModel.aggregate([
      {
        $match: {
          dueDate: { $gt: new Date() },
          status: { $in: ["DRAFTED", "SENT"] },
          isSalesReturned: false,
          userId: mongoose.Types.ObjectId(
            authUser.role === "Super Admin" ? authUser.id : authUser.userId
          ),
        },
      },
      {
        $group: {
          _id: null,
          total_sum: { $sum: { $toDouble: "$TotalAmount" } },
          count: { $sum: 1 },
        },
      },
    ]);
    var recurring_total = await invoiceModel.aggregate([
      {
        $match: {
          isRecurring: true,
          userId: mongoose.Types.ObjectId(
            authUser.role === "Super Admin" ? authUser.id : authUser.userId
          ),
        },
      },
      {
        $group: {
          _id: null,
          total_sum: { $sum: { $toDouble: "$TotalAmount" } },
          count: { $sum: 1 },
        },
      },
    ]);
    //   var total_invoice = await invoiceModel.aggregate([
    //     { $match: { status: 'CANCELLED'} },
    //     { $group: { _id: null, total_sum: { $sum: "$total" }, sub_total: { $sum: "$sub_total" } } }
    // ])
    data = {
      total_invoice: total_invoice,
      total_invoice_today: total_invoice_today,
      total_invoice_week: total_invoice_week,
      total_outstanding: total_outstanding,
      difference: difference,
      total_invoice_month: total_invoice_month,
      total_overdue: total_overdue,
      total_cancelled: total_cancelled,
      total_drafted: total_drafted,
      recurring_total: recurring_total,
    };

    response.success_message(data, res);
  } catch (error) {
    console.log("error :", error);
    response.error_message(error.message, res);
  }
};
// Card count function End

//PDF generate function Start

exports.sendPdf = async (req, res) => {
  try {
    var invoiceId = req.query.invoiceId;
    const invoiceSettings = await invoiceSettingsModel.find().lean();
    const companySettings = await companySettingModel.find().lean();
    const preferenceSettingsRec = await preferenceSettingsModel
      .findOne()
      .populate("currencyId")
      .lean();
    const invoiceinfo = await invoiceModel
      .findOne({ _id: mongoose.Types.ObjectId(invoiceId), is_deleted: false })
      .populate({ path: "customerId", select: "-_id -updated_at -__v" })
      .populate("bank")
      .select("-__v -updated_at")
      .lean();
    invoiceinfo.currency = preferenceSettingsRec.currencyId.currency_symbol;
    invoiceinfo.companySettings = companySettings[0];
    invoiceinfo.invoiceLogo = `${process.env.DEVLOPMENT_BACKEND_URL}/${invoiceSettings[0].invoiceLogo}`;
    invoiceinfo.amountInWords = new ToWords().convert(invoiceinfo.TotalAmount, {
      currency: true,
    });
    invoiceinfo.invoiceDate = moment(invoiceinfo.invoiceDate).format(
      "DD-MMM-YYYY"
    );
    invoiceinfo.totalItems = invoiceinfo.items.length;
    console.log(
      "invoiceinfo.item.taxInfo.taxRate :",
      JSON.parse(invoiceinfo.items[0].taxInfo).taxRate
    );
    let count = 1;
    let totalqty = 0;
    let taxAmount = 0;
    let sub_total = 0;
    invoiceinfo.items.forEach((item) => {
      item.count = count;
      item.taxPercentage = JSON.parse(item.taxInfo).taxRate;
      totalqty += parseFloat(item.quantity);
      taxAmount += parseFloat(item.tax);
      sub_total += parseFloat(item.rate);

      count++;
    });
    invoiceinfo.totalqty = totalqty;
    invoiceinfo.Tax = taxAmount;
    invoiceinfo.sub_total = sub_total;
    invoiceinfo.roundOffValue = (
      parseFloat(invoiceinfo.TotalAmount) -
      (parseFloat(sub_total) -
        parseFloat(invoiceinfo.totalDiscount) +
        parseFloat(taxAmount))
    ).toFixed(2);
    const baseDirectory = resolve(__dirname, "..", "..", ".."); // Adjust the number of '..' as needed
    const invoicesPdfDirectory = "uploads/invoicesPdf";
    const fileName = "invoice.pdf";

    // Using join to create complete paths
    const folderPath = join(baseDirectory, invoicesPdfDirectory);
    const fullPath = join(folderPath, fileName);

    if (!fs.existsSync(folderPath)) {
      fs.mkdirSync(folderPath, { recursive: true });
    }

    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
    }
    const htmlTemplate = fs.readFileSync("receipt.html", "utf-8");
    const template = handlebars.compile(htmlTemplate);
    const renderedHtml = template({ invoice: invoiceinfo });
    // const browser = await puppeteer.launch({ headless: true });
    const browser = await puppeteer.launch({ args: ["--no-sandbox"] });
    const page = await browser.newPage();

    await page.setContent(renderedHtml);
    await page.pdf({ path: fullPath, format: "A4" });

    await browser.close();
    var subject = `Facture N° ${invoiceinfo.invoiceNumber}`;
    let emailBody = `
    <p>Merci pour votre confiance. Votre document peut être consulté, imprimé et téléchargé au format PDF à partir de la pièce jointe.</p>
    <p><b>Référence :</b> ${invoiceinfo.invoiceNumber}</p>
    <p><b>Date :</b> ${invoiceinfo.invoiceDate}</p>
    <p><b>Total :</b> ${invoiceinfo.TotalAmount.toLocaleString("en-IN", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).replace(/,/g, " ")}</p>
  `;
    const emailSettings = await emailSettingModel.findOne().lean();

    let mailres;
    if (emailSettings != null) {
      const transporters = await createTransporters();
      const nodeTransporter = transporters.nodeTransporter;
      const smtpTransporter = transporters.smtpTransporter;

      if (emailSettings.provider_type === "NODE") {
        mailres = await nodeTransporter.sendMail({
          from: `${emailSettings.nodeFromName} <${emailSettings.nodeFromEmail}>`,
          to: invoiceinfo.customerId.email,
          subject: subject,
          html: emailBody,
          attachments: [
            {
              filename: "invoice.pdf",
              path: fullPath,
              contentType: "application/pdf",
            },
          ],
        });
      } else {
        mailres = await smtpTransporter.sendMail({
          from: `${emailSettings.smtpFromName} <${emailSettings.smtpFromEmail}>`,
          to: invoiceinfo.customerId.email,
          subject: subject,
          html: emailBody,
          attachments: [
            {
              filename: "invoice.pdf",
              path: fullPath,
              contentType: "application/pdf",
            },
          ],
        });
      }
    }
    if (mailres) {
      response.success_message({ message: "Mail sent successfully!" }, res);
    } else {
      data = { message: "From email is empty!" };
      response.validation_error_message(data, res);
    }
  } catch (error) {
    console.log("error :", error);
    response.error_message(error, res);
  }
};

exports.view = async function (req, res) {
  const authUser = verify.verify_token(req.headers.token).details;
  try {
    console.log("id ", req.params.id);

    const invoiceinfo = await invoiceModel
      .findOne({
        _id: mongoose.Types.ObjectId(req.params.id),
        is_deleted: false,
        userId: mongoose.Types.ObjectId(
          authUser.role === "Super Admin" ? authUser.id : authUser.userId
        ),
      })
      .populate({ path: "customerId", select: "-updated_at -__v" })
      .populate({ path: "signatureId", select: "-updated_at -__v" })
      .populate({ path: "bank", select: "-updated_at -__v" })
      .select("-__v -updated_at")
      .lean();

    if (invoiceinfo) {
      const invoiceSettings = await invoiceSettingsModel.findOne().lean();
      if (invoiceSettings) {
        invoiceinfo.invoiceLogo = `${process.env.DEVLOPMENT_BACKEND_URL}/${invoiceSettings.invoiceLogo}`;
      } else {
        invoiceinfo.invoiceLogo = "";
      }
      const paymentDetails = await paymentModel
        .findOne({ invoiceId: invoiceinfo._id })
        .sort({ _id: -1 })
        .lean();

      if (paymentDetails !== null) {
        invoiceinfo.balance =
          parseInt(invoiceinfo.TotalAmount) - paymentDetails.amount;
        invoiceinfo.paidAmount = paymentDetails.amount;
      } else {
        invoiceinfo.balance = invoiceinfo.TotalAmount;
        invoiceinfo.paidAmount = 0;
      }
      if (invoiceinfo.signatureImage) {
        invoiceinfo.signatureImage = `${process.env.DEVLOPMENT_BACKEND_URL}/${invoiceinfo.signatureImage}`;
      }
      if (invoiceinfo.signatureId) {
        invoiceinfo.signatureId.signatureImage = `${process.env.DEVLOPMENT_BACKEND_URL}/${invoiceinfo.signatureId.signatureImage}`;
      }

      if (invoiceinfo.status == "OVERDUE") {
        await invoiceModel.updateOne(
          { _id: invoiceinfo._id },
          { $set: { status: "OVERDUE" } }
        );
      }

      // Check if the signatureId exists or not
      if (!invoiceinfo.signatureId) {
        invoiceinfo.signatureId = {}; // Set an empty object if signatureId doesn't exist
      }

      const data = {
        invoice_details: invoiceinfo,
      };

      response.success_message(data, res);
    } else {
      const data = {
        invoice_details: [],
        message: "No result found",
      };

      response.success_message(data, res);
    }
  } catch (error) {
    console.log("error:", error);
    response.error_message(error.message, res);
  }
};

exports.update = async (req, res) => {
  try {
    const authUser = verify.verify_token(req.headers.token).details;

    var request = req.body;
    const bankValue = request.bank;
    const bankObjectId = bankValue ? mongoose.Types.ObjectId(bankValue) : null;
    let request1 = [];

    request.items.forEach((item) => {
      let obj = {};
      obj.productId = item.productId;
      obj.quantity = item.quantity;
      obj.name = item.name;
      request1.push(obj);
    });

    const invoiceRec = await invoiceModel.findById(req.params.id);
    let invoRec = invoiceRec;

    invoiceRec.items.forEach((item) => {
      request1.forEach((reqItem) => {
        if (item.productId == reqItem.productId) {
          reqItem.quantity =
            parseInt(reqItem.quantity) - parseInt(item.quantity);
        }
      });
    });
    let minQuanProducts = [];
    console.log(request1);

    for (const item of request1) {
      let iteratedIds = [];
      const invRec = await inventoryModel
        .findOne({
          productId: item.productId,
        })
        .lean();

      if (
        !iteratedIds.includes(invRec?.productId) &&
        invRec?.quantity < parseInt(item?.quantity)
      ) {
        invoRec.items.forEach((item) => {
          if (item.productId == invRec.productId) {
            invRec.quantity += parseInt(item.quantity);
            iteratedIds.push(invRec.productId);
          }
        });
        minQuanProducts.push(
          `${item.name} has only ${invRec.quantity} quantity`
        );
      }
    }
    if (minQuanProducts.length > 0) {
      response.validation_error_message({ message: minQuanProducts }, res);
    } else {
      let filesName = invoiceRec.signatureImage;
      if (req.file) {
        filesName = req.file.path;
        if (
          invoiceRec.signatureImage !== "" &&
          fs.existsSync(invoiceRec.signatureImage)
        ) {
          const rootDir = path.resolve("./");
          let oldImagePath = path.join(rootDir, invoiceRec.signatureImage);
          fs.unlinkSync(oldImagePath);
        }
      }

      var newvalues = {
        $set: {
          customerId: request.customerId,
          invoiceDate: request.invoiceDate,
          dueDate: request.dueDate,
          invoiceNumber: request.invoiceNumber,
          referenceNo: request.referenceNo,
          payment_method: request.payment_method,
          currency: request.currency,
          selectedOtherTaxes: request.selectedOtherTaxes,
          selectedTaxRates: request.selectedTaxRates,
          items: request.items,
          notes: request.notes,
          bank: bankObjectId,
          termsAndCondition: request.termsAndCondition,
          taxable_amount: request.taxable_amount,
          sub_total: request.sub_total,
          sign_type: request.sign_type,
          signatureId:
            request.signatureId === "undefined" ? null : request.signatureId,
          signatureName:
            request.sign_type === "eSignature" ? request.signatureName : null,
          signatureImage: request.sign_type === "eSignature" ? filesName : null,
          // signatureImage: filesName ? filesName : undefined,
          taxableAmount: request.taxableAmount,
          totalDiscount: request.totalDiscount,
          vat: request.vat,
          roundOff: request.roundOff,
          TotalAmount: request.TotalAmount,
          isRecurring: request.isRecurring,
          recurringCycle: request.recurringCycle ? request.recurringCycle : 0,
          total: request.total,
          userId:
            authUser.role === "Super Admin" ? authUser.id : authUser.userId,
        },
      };

      if (request.status && request.status != "") {
        newvalues.status = request.status;
      }

      const dublicaterec = await invoiceModel.findOne({
        userId: authUser.role === "Super Admin" ? authUser.id : authUser.userId,
        invoiceNumber: request.invoiceNumber,
        _id: { $ne: req.params.id },
      });

      if (dublicaterec) {
        data = { message: "Invoice Number Already Exists.." };
        response.validation_error_message(data, res);
      } else {
        const invoiceDetails = await invoiceModel.findByIdAndUpdate(
          req.params.id,
          newvalues,
          { new: true }
        );
        if (invoiceDetails) {
          for (let item of invoiceRec.items) {
            const inventoryRecord = await inventoryModel.findOne({
              productId: item.productId,
            });
            console.log("invoiceDetails " + invoiceDetails);

            if (inventoryRecord) {
              const updatedQty =
                inventoryRecord.quantity + parseInt(item.quantity);
              const invRec = await inventoryModel.findByIdAndUpdate(
                inventoryRecord._id,
                {
                  $set: {
                    quantity: updatedQty,
                  },
                },
                { new: true }
              );
            }
          }
          invoiceDetails.items.forEach(async (item) => {
            const inventoryRecord = await inventoryModel
              .findOne({
                productId: item.productId,
              })
              .lean();

            if (inventoryRecord) {
              console.log("ok " + inventoryRecord);

              const updatedQuan =
                parseInt(inventoryRecord.quantity) - parseInt(item.quantity);
              const updatedRec = await inventoryModel.findByIdAndUpdate(
                inventoryRecord._id,
                {
                  $set: {
                    quantity: updatedQuan,
                  },
                },
                { new: true }
              );
            } else {
              let obj = {};
              obj.productId = item.productId;
              obj.quantity = item.quantity;
              obj.units = item.unit;
              obj.notes = request.notes;
              obj.user_id =
                authUser.role === "Super Admin" ? authUser.id : authUser.userId;
              obj.created_at = new Date();
              const inventoryRec = await inventoryModel.create(obj);
            }
          });
          await notification.minStockAlert(req, res);
          const customerName = await customerModel.findById(request.customerId);
          const adminRole = await users.findOne({ role: "Super Admin" });

          let data = { message: "Invoice updated successfully." };

          if (authUser.role === "Super Admin") {
            // Send notification only to Super Admin if available
            if (adminRole) {
              await notification.sendFCMMessage(
                {
                  title: "Notification Message",
                  body: `An invoice has been updated for ${customerName.name}`,
                },
                [adminRole._id]
              );
            } else {
              console.log("Super Admin not found in the database");
            }
          } else if (authUser.role !== "Super Admin" && adminRole) {
            // Send notification to users who are not Super Admin but have the adminRole
            await notification.sendFCMMessage(
              {
                title: "Notification Message",
                body: `An invoice has been updated for ${customerName.name}`,
              },
              [adminRole._id]
            );
          }

          response.success_message(data, res);
        }
      }
    }
  } catch (error) {
    console.log("error :", error);
    response.error_message(error.message, res);
  }
};

exports.update_status = async (req, res) => {
  try {
    var request = req.body;
    var newvalues = {
      $set: {
        status: request.status,
      },
    };
    const inv = await invoiceModel.findByIdAndUpdate(req.params.id, newvalues);
    if (inv) {
      data = { message: "Status updated successfully." };
      response.success_message(data, res);
    }
  } catch (error) {
    console.log("error :", error);
    response.error_message(error.message, res);
  }
};

exports.softDelete = async function (req, res) {
  try {
    const authUser = verify.verify_token(req.headers.token).details;
    const invoice_model = await invoiceModel.findOneAndUpdate(
      { _id: req.params.id, isDeleted: { $ne: true } },
      { $set: { isDeleted: true } },
      { new: true }
    );
    if (invoice_model) {
      for (const item of invoice_model.items) {
        const inventoryRecord = await inventoryModel.findOne({
          productId: item.productId,
        });
        let updatedQty = inventoryRecord.quantity + parseInt(item.quantity);
        await inventoryModel.findByIdAndUpdate(inventoryRecord._id, {
          $set: {
            quantity: updatedQty,
          },
        });
      }
      const customer = await customerModel.findById(invoice_model.customerId);
      const customerName = customer ? customer.name : "Unknown Customer";
      const adminRole = await users.findOne({ role: "Super Admin" });

      if (authUser.role === "Super Admin") {
        // Send notification only to Super Admin if available
        if (adminRole) {
          await notification.sendFCMMessage(
            {
              title: "Notification Message",
              body: `An invoice has been Deleted for ${customerName}`,
            },
            [adminRole._id]
          );
        } else {
          console.log("Super Admin not found in the database");
        }
      } else if (authUser.role !== "Super Admin" && adminRole) {
        // Send notification to users who are not Super Admin but have the adminRole
        await notification.sendFCMMessage(
          {
            title: "Notification Message",
            body: `An invoice has been Deleted for ${customerName}`,
          },
          [adminRole._id]
        );
      }

      response.success_message(invoice_model, res);
    }
  } catch (error) {
    response.error_message(error, res);
  }
};

exports.cloneInvoice = async function (req, res) {
  try {
    const authUser = verify.verify_token(req.headers.token).details;
    const originalInvoiceId = req.params.id;
    const originalInvoice = await invoiceModel
      .findById(originalInvoiceId)
      .populate({ path: "customerId", select: "-updated_at -__v" });

    if (!originalInvoice) {
      return response.data_error_message("Invoice not found", res);
    }
    if (originalInvoice.sign_type == "eSignature") {
      const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
      const ext = path.extname(originalInvoice.signatureImage);
      const invoiceImagePath = `./uploads/invoices/signatureImage-${
        uniqueSuffix + ext
      }`;
      fs.copyFileSync(`./${originalInvoice.signatureImage}`, invoiceImagePath);

      originalInvoice.signatureImage = invoiceImagePath;
    }

    let minQuanProducts = [];
    for (const item of originalInvoice.items) {
      const invRec = await inventoryModel.findOne({
        productId: item.productId,
      });
      if (invRec.quantity < parseInt(item.quantity)) {
        minQuanProducts.push(
          `${item.name} has only ${invRec.quantity} quantity`
        );
      }
    }
    if (minQuanProducts.length > 0) {
      response.validation_error_message({ message: minQuanProducts }, res);
    } else {
      const invoiceModelCount = await invoiceModel.countDocuments({
        userId: authUser.role === "Super Admin" ? authUser.id : authUser.userId,
      });
      let count = invoiceModelCount + 1;

      const invoiceSettings = await invoiceSettingsModel
        .find({
          userId:
            authUser.role === "Super Admin" ? authUser.id : authUser.userId,
        })
        .lean();
      const clonedInvoice = new invoiceModel(originalInvoice.toObject());
      clonedInvoice._id = mongoose.Types.ObjectId();
      clonedInvoice.status = "DRAFTED";
      clonedInvoice.isCloned = true;
      clonedInvoice.invoiceNumber = `${invoiceSettings[0].invoicePrefix}${count
        .toString()
        .padStart(6, "0")}`;

      clonedInvoice.customerId = originalInvoice.customerId;

      const savedInvoice = await clonedInvoice.save();
      if (savedInvoice) {
        const invoiceRes = await invoiceModel
          .findById(savedInvoice._id)
          .populate("customerId")
          .lean();
        for (const item of savedInvoice.items) {
          const inventoryRecord = await inventoryModel.findOne({
            productId: item.productId,
          });
          if (inventoryRecord) {
            let updatedQty = inventoryRecord.quantity - parseInt(item.quantity);
            const updatedRec = await inventoryModel.findByIdAndUpdate(
              inventoryRecord._id,
              {
                $set: {
                  quantity: updatedQty,
                },
              }
            );
          }
        }
        const paymentDetails = await paymentModel.aggregate([
          {
            $match: {
              invoiceId: mongoose.Types.ObjectId(savedInvoice._id),
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
          invoiceRes.balance =
            parseFloat(invoiceRes.TotalAmount) - paymentDetails[0].paidAmount;
          invoiceRes.paidAmount = paymentDetails[0].paidAmount;
        } else {
          invoiceRes.balance = invoiceRes.TotalAmount;
          invoiceRes.paidAmount = 0;
        }
        if (invoiceRes.signatureImage) {
          invoiceRes.signatureImage = `${process.env.DEVLOPMENT_BACKEND_URL}/${invoiceRes.signatureImage}`;
        }
        return response.success_message(invoiceRes, res);
      }
    }
  } catch (error) {
    console.log("error :", error);
    response.error_message(error.message, res);
  }
};

exports.convertsalesreturn = async (req, res) => {
  try {
    const authUser = verify.verify_token(req.headers.token).details;
    const originalInvoiceId = req.params.id;
    const filter = {
      _id: originalInvoiceId,
      isSalesReturned: false,
    };
    const originalInvoice = await invoiceModel.find(filter);
    let originalInvoiceDetails = originalInvoice[0];
    if (!originalInvoice) {
      return res.status(404).json({ error: "Original Invoice not found" });
    }
    let creditNoteImagePath = "";
    if (originalInvoiceDetails.sign_type == "eSignature") {
      const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
      const ext = path.extname(originalInvoiceDetails.signatureImage);
      creditNoteImagePath = `./uploads/credit_notes/signatureImage-${
        uniqueSuffix + ext
      }`;
      fs.copyFileSync(
        `./${originalInvoiceDetails.signatureImage}`,
        creditNoteImagePath
      );
    }

    const creditnotecount = await creditnoteModel.find({}).count();
    let count = creditnotecount + 1;
    // return res.status(200).json({ originalInvoice: originalInvoice });
    creditnoteModel.create(
      {
        credit_note_id: `CN-${count.toString().padStart(6, "0")}`,
        customerId: originalInvoiceDetails.customerId,
        credit_note_date: new Date().toDateString(),
        // credit_note_date: originalInvoiceDetails.invoiceDate,
        due_date: originalInvoiceDetails.dueDate,
        reference_no: originalInvoiceDetails.referenceNo,
        items: originalInvoiceDetails.items,
        discountType: originalInvoiceDetails.discountType,
        status: "PAID",
        paymentMode: "CASH",
        discount: originalInvoiceDetails.discount,
        tax: originalInvoiceDetails.tax,
        taxableAmount: originalInvoiceDetails.taxableAmount,
        totalDiscount: originalInvoiceDetails.totalDiscount,
        vat: originalInvoiceDetails.vat,
        roundOff: originalInvoiceDetails.roundOff,
        TotalAmount: originalInvoiceDetails.TotalAmount,
        bank: originalInvoiceDetails.bank,
        notes: originalInvoiceDetails.notes,
        termsAndCondition: originalInvoiceDetails.termsAndCondition,
        sign_type: originalInvoiceDetails.sign_type,
        signature_name: originalInvoiceDetails.signatureName,
        signatureImage: creditNoteImagePath ? creditNoteImagePath : " ",
        signatureId: originalInvoiceDetails.signatureId
          ? originalInvoiceDetails.signatureId
          : null,
        userId: authUser.role === "Super Admin" ? authUser.id : authUser.userId,
      },
      async (err, crnrec) => {
        if (err) {
          data = { message: err.message };
          response.validation_error_message(data, res);
        } else {
          if (crnrec) {
            await crnrec.items.forEach(async (item) => {
              const inventoryRecord = await inventoryModel.findOne({
                productId: item.productId,
              });
              if (inventoryRecord) {
                let updatedQty =
                  inventoryRecord.quantity + parseInt(item.quantity);
                const updatedRec = await inventoryModel.findByIdAndUpdate(
                  inventoryRecord._id,
                  {
                    $set: {
                      quantity: updatedQty,
                    },
                  }
                );
              }
            });
            await invoiceModel.findOneAndUpdate(
              {
                _id: originalInvoiceId,
                isSalesReturned: false,
              },
              { $set: { isSalesReturned: true } },
              { new: true }
            );

            data = {
              message: "Invoice converted to sales return successfully.",
              auth: true,
            };
            response.success_message(data, res);
          } else {
            data = { message: "Failed.", auth: true };
            response.error_message(data, res);
          }
        }
      }
    );
  } catch (error) {
    console.log("error", error);
    data = { message: error.message };
    response.validation_error_message(data, res);
  }
};

exports.convertRecurringInvoice = async (req, res) => {
  try {
    const invoiceRec = await invoiceModel.findOneAndUpdate(
      { _id: mongoose.Types.ObjectId(req.params.id) },
      {
        $set: {
          isRecurring: false,
          isRecurringCancelled: true,
          recurringCycle: "0",
        },
      },
      {
        new: true,
      }
    );
    if (invoiceRec) {
      response.success_message(
        { message: "Recurring invoice changed successfully" },
        res
      );
    }
  } catch (error) {
    console.log("error :", error);
    response.error_message(error.message, res);
  }
};

exports.getInvoiceNumber = async (req, res) => {
  const authUser = verify.verify_token(req.headers.token).details;
  try {
    const invoiceSettingRecord = await invoiceSettingsModel
      .findOne({
        userId: authUser.role === "Super Admin" ? authUser.id : authUser.userId,
      })
      .lean();
    let invoicePrefix = "";
    if (invoiceSettingRecord && invoiceSettingRecord.invoicePrefix) {
      invoicePrefix = invoiceSettingRecord.invoicePrefix;
    }
    const invoiceRecords = await invoiceModel
      .find({
        userId: authUser.role === "Super Admin" ? authUser.id : authUser.userId,
      })
      .count();
    const invoiceNumber = `${invoicePrefix}${(invoiceRecords + 1)
      .toString()
      .padStart(5, 0)}`;
    response.success_message(invoiceNumber, res);
  } catch (error) {
    console.log("error :", error);
    response.error_message(error.message, res);
  }
};

exports.generateDeliveryChallans = async (req, res) => {
  try {
    const authUser = verify.verify_token(req.headers.token).details;
    const DeliveryChallansCount = await delivery_challansModel
      .find({
        userId: authUser.role === "Super Admin" ? authUser.id : authUser.userId,
      })
      .count();
    const count = DeliveryChallansCount + 1;
    const invoiceRecord = await invoiceModel.findById(req.params.id);
    const customerRecord = await customerModel
      .findById(invoiceRecord.customerId)
      .lean();

    let imagePath = "";
    if (invoiceRecord.sign_type == "eSignature") {
      const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
      const ext = path.extname(invoiceRecord.signatureImage);
      imagePath = `./uploads/delivery_challans/signatureImage-${
        uniqueSuffix + ext
      }`;
      fs.copyFileSync(`./${invoiceRecord.signatureImage}`, imagePath);
    }

    await delivery_challansModel.create({
      deliveryChallanNumber: `DC-${count.toString().padStart(6, "0")}`,
      customerId: invoiceRecord.customerId,
      deliveryChallanDate: new Date(),
      dueDate: invoiceRecord.dueDate,
      referenceNo: invoiceRecord.referenceNo,
      items: invoiceRecord.items,
      discountType: invoiceRecord.discountType,
      discount: invoiceRecord.discount,
      tax: invoiceRecord.tax,
      taxableAmount: invoiceRecord.taxableAmount,
      totalDiscount: invoiceRecord.totalDiscount,
      vat: invoiceRecord.vat,
      roundOff: invoiceRecord.roundOff,
      TotalAmount: invoiceRecord.TotalAmount,
      bank: invoiceRecord.bank,
      notes: invoiceRecord.notes,
      termsAndCondition: invoiceRecord.termsAndCondition,
      sign_type: invoiceRecord.sign_type,
      signatureId: invoiceRecord.signatureId,
      signatureName: invoiceRecord.signatureName,
      signatureImage:
        invoiceRecord.sign_type === "eSignature" ? imagePath : null,
      userId: authUser.role === "Super Admin" ? authUser.id : authUser.userId,
    });
    response.success_message("DeliveryChallan created successfully", res);
  } catch (error) {
    console.log("error :", error);
    response.error_message(error.message, res);
  }
};
