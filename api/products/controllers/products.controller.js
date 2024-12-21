const productsModel = require("../models/products.model");
const response = require("../../../response");
const verify = require("../../../verify.token");
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const { isNumber } = require("util");
const PDFDocument = require("pdfkit");
const { Readable } = require("stream");
const { createArrayCsvStringifier } = require("csv-writer");
var data;

exports.exportProducts = async (req, res) => {
  console.log("ok");
  const auth_user = verify.verify_token(req.headers.token).details;
  try {
    const request = req.query;
    let filter = {};
    filter.isDeleted = false;
    filter.userId =
      auth_user.role === "Super Admin" ? auth_user.id : auth_user.userId;

    if (request.product) {
      let splittedVal = request.product.split(",").map((id) => {
        return mongoose.Types.ObjectId(id);
      });
      filter._id = { $in: splittedVal };
    }
    if (request.search_product) {
      filter.name = {
        $regex: `^${request.search_product}`,
        $options: "i",
      };
    }
    const productRecordsCount = await productsModel.find(filter).count();
    const productRec = await productsModel
      .find(filter)
      .sort({ _id: -1 })
      .lean()
      .populate("category")
      .populate("units")
      .populate("tax");
    productRec.forEach((item) => {
      item.text = item.name;
      item.id = item._id;
      if (item.images && item.images.length > 0 && item.images[0]) {
        item.images = `${process.env.DEVLOPMENT_BACKEND_URL}/${item.images[0]}`;
        if (item.category && item.category.image) {
          item.category.image = `${process.env.DEVLOPMENT_BACKEND_URL}/${item.category.image}`;
        }
      }
    });
    response.success_message(productRec, res, productRecordsCount);
  } catch (error) {
    console.log("error :", error);
    response.error_message(error.message, res);
  }
};

exports.create = async (req, res) => {
  try {
    var request = req.body;
    console.log("product", request);
    const auth_user = verify.verify_token(req.headers.token).details;
    let filePath = "";
    if (req.file) {
      filePath = req.file.path;
    }
    const name = request.name.trim().toLowerCase();
    const productrec = await productsModel.findOne({
      name: { $regex: new RegExp(`^${name}$`, "i") },
      userId:
        auth_user.role === "Super Admin" ? auth_user.id : auth_user.userId,
      isDeleted: false,
    });
    if (productrec) {
      data = { message: "Product name already exists." };
      response.validation_error_message(data, res);
    } else {
      const productrec = await productsModel.create({
        type: request.type,
        name: request.name,
        sku: request.sku,
        category: request.category,
        sellingPrice: request.sellingPrice,
        purchasePrice: !isNaN(request.purchasePrice)
          ? request.purchasePrice
          : 0,
        discountValue: request.discountValue,
        units: request.units,
        discountType: request.discountType,
        barcode: request.barcode,
        alertQuantity: 1,
        tax: request.tax ? request.tax : null,
        productDescription: request.productDescription,
        userId:
          auth_user.role === "Super Admin" ? auth_user.id : auth_user.userId,
        images: filePath,
      });

      if (productrec) {
        data = {
          message: "product Created successfully.",
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
exports.getInvoiceNumber = async (req, res) => {
  const authUser = verify.verify_token(req.headers.token).details;
  try {
    let invoicePrefix = req.params.type === "product" ? "P" : "S";
    const invoiceRecords = await productsModel
      .find({
        userId: authUser.role === "Super Admin" ? authUser.id : authUser.userId,
        type: req.params.type === "product" ? "product" : "service",
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
exports.list = async (req, res) => {
  const auth_user = verify.verify_token(req.headers.token).details;
  try {
    const request = req.query;
    let filter = {};
    filter.isDeleted = false;
    filter.userId =
      auth_user.role === "Super Admin" ? auth_user.id : auth_user.userId;

    if (request.product) {
      let splittedVal = request.product.split(",").map((id) => {
        return mongoose.Types.ObjectId(id);
      });
      filter._id = { $in: splittedVal };
    }
    if (request.search_product) {
      filter.name = {
        $regex: `^${request.search_product}`,
        $options: "i",
      };
    }
    const productRecordsCount = await productsModel.find(filter).count();
    const productRec = await productsModel
      .find(filter)
      .sort({ _id: -1 })
      .skip(request.skip)
      .limit(request.limit)
      .lean()
      .populate("category")
      .populate("units")
      .populate("tax");
    productRec.forEach((item) => {
      item.text = item.name;
      item.id = item._id;
      if (item.images && item.images.length > 0 && item.images[0]) {
        item.images = `${process.env.DEVLOPMENT_BACKEND_URL}/${item.images[0]}`;
        if (item.category && item.category.image) {
          item.category.image = `${process.env.DEVLOPMENT_BACKEND_URL}/${item.category.image}`;
        }
      }
    });
    response.success_message(productRec, res, productRecordsCount);
  } catch (error) {
    console.log("error :", error);
    response.error_message(error.message, res);
  }
};

exports.view = async (req, res) => {
  const auth_user = verify.verify_token(req.headers.token).details;
  try {
    const productsinfo = await productsModel
      .findOne({
        _id: req.params.id,
        userId:
          auth_user.role === "Super Admin" ? auth_user.id : auth_user.userId,
      })
      .populate("units")
      .populate("tax")
      .populate("category")
      .lean()
      .select("-__v -updated_at");

    if (productsinfo) {
      if (productsinfo.images.length > 0 && productsinfo.images[0]) {
        productsinfo.images = `${process.env.DEVLOPMENT_BACKEND_URL}/${productsinfo.images}`;
      }
      productsinfo.category.image = `${process.env.DEVLOPMENT_BACKEND_URL}/${productsinfo.category.image}`;
      data = {
        products_details: productsinfo,
      };
      response.success_message(productsinfo, res);
    } else {
      data = {
        products_details: [],
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
    var token = req.headers.token;
    var request = req.body;
    const imageRec = await productsModel.findById(req.params.id);
    let newImage = imageRec.images;
    if (req.file) {
      newImage = req.file.path;
      if (imageRec.images !== "" && fs.existsSync(imageRec.images)) {
        const rootDir = path.resolve("./");
        let oldImagePath = path.join(rootDir, imageRec.images);
        fs.unlinkSync(oldImagePath);
      }
    }
    var newvalues = {
      $set: {
        type: request.type,
        name: request.name,
        sku: request.sku,
        category: request.category,
        sellingPrice: parseInt(request.sellingPrice),
        purchasePrice: !isNaN(request.purchasePrice)
          ? request.purchasePrice
          : 0,
        discountValue: parseInt(request.discountValue),
        units: request.units,
        discountType: request.discountType,
        barcode: request.barcode,
        alertQuantity: request.alertQuantity,
        tax: request.tax ? request.tax : null,
        productDescription: request.productDescription,
        purchase_account: request.purchase_account,
        purchase_description: request.purchase_description,
        userId:
          auth_user.role === "Super Admin" ? auth_user.id : auth_user.userId,
        images: newImage,
      },
    };

    const name = request.name.trim().toLowerCase();
    const dublicaterec = await productsModel.findOne({
      name: { $regex: new RegExp(`^${name}$`, "i") },
      userId:
        auth_user.role === "Super Admin" ? auth_user.id : auth_user.userId,
      _id: { $ne: req.params.id },
    });

    if (dublicaterec) {
      data = { message: "Product name already exists." };
      response.validation_error_message(data, res);
    } else {
      const prod = await productsModel.findByIdAndUpdate(
        req.params.id,
        newvalues
      );

      if (prod) {
        data = { message: "products updated successfully." };
        response.success_message(data, res);
      }
    }
  } catch (error) {
    console.log("error :", error);
    response.error_message(error.message, res);
  }
};

exports.delete = async (req, res) => {
  const auth_user = verify.verify_token(req.headers.token).details;
  try {
    const product_model = await productsModel.findOneAndUpdate(
      {
        _id: req.body._id,
        isDeleted: { $ne: true },
        userId:
          auth_user.role === "Super Admin" ? auth_user.id : auth_user.userId,
      },
      { $set: { isDeleted: true } },
      { new: true }
    );
    if (product_model) {
      data = { message: "product deleted successfully." };
      response.success_message(data, res);
    }
  } catch (error) {
    console.log("error :", error);
    response.error_message(error.message, res);
  }
};

exports.generateSKU = (req, res) => {
  try {
    const randomNum = parseInt(Math.random() * 1000000);
    response.success_message(randomNum, res);
  } catch (error) {
    response.error_message(error.message, res);
  }
};

exports.deleteImage = async (req, res) => {
  try {
    const rootDir = path.resolve("./");

    let oldImagePath = path.join(rootDir, req.body.path);
    fs.unlinkSync(oldImagePath);
    response.success_message({ message: "image deleted successfully" }, res);
  } catch (error) {
    console.log("error :", error);
    response.error_message(error.message, res);
  }
};
