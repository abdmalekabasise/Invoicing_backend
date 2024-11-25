const response = require("../../../response");
const customerModel = require("../../customers/models/customers.model");
const vendorModel = require("../../vendor/models/vendor.model");
const categoryModel = require("../../category/models/category.model");
const unitModel = require("../../units/models/unit_type.model");
const productModel = require("../../products/models/products.model");
const taxModel = require("../../tax/models/tax.model");
const othertaxModel = require("../../tax2/models/othertax.model");

const bankModel = require("../../bank_settings/models/bankSettings.model");
const roleModel = require("../../role/models/roles.model");
const signatureModel = require("../../signature/models/signature.model");
const verify = require("../../../verify.token");

exports.customerList = async (req, res) => {

  const authUser = verify.verify_token(req.headers.token).details;
  try {
    const customersRec = await customerModel.find({ isDeleted: false, status: "Active", userId: authUser.role === "Super Admin" ? authUser.id : authUser.userId });
    response.success_message(customersRec, res);
  } catch (error) {
    response.error_message(error.message, res);
  }
};

exports.vendorList = async (req, res) => {
  const authUser = verify.verify_token(req.headers.token).details;
  try {
    const vendorRecords = await vendorModel.find({ isDeleted: false, user_id: authUser.role === "Super Admin" ? authUser.id : authUser.userId });
    response.success_message(vendorRecords, res);
  } catch (error) {
    response.error_message(error.message, res);
  }
};

exports.categoryList = async (req, res) => {
  const authUser = verify.verify_token(req.headers.token).details;
  try {
    const categoryRecords = await categoryModel.find({ isDeleted: false, user_id: authUser.role === "Super Admin" ? authUser.id : authUser.userId });
    response.success_message(categoryRecords, res);
  } catch (error) {
    response.error_message(error.message, res);
  }
};

exports.unitList = async (req, res) => {
  const authUser = verify.verify_token(req.headers.token).details;
  try {
    const unitRecords = await unitModel.find({ isDeleted: false, user_id: authUser.role === "Super Admin" ? authUser.id : authUser.userId });
    response.success_message(unitRecords, res);
  } catch (error) {
    response.error_message(error.message, res);
  }
};

exports.productList = async (req, res) => {
  const authUser = verify.verify_token(req.headers.token).details;
  try {
    const productRecords = await productModel
      .find({ isDeleted: false, userId: authUser.role === "Super Admin" ? authUser.id : authUser.userId })
      .populate("category")
      .populate("units")
      .populate("tax");
    response.success_message(productRecords, res);
  } catch (error) {
    response.error_message(error.message, res);
  }
};

exports.taxList = async (req, res) => {
  const authUser = verify.verify_token(req.headers.token).details;
  try {
    const TaxRecords = await taxModel.find({ status: true, isDeleted: false, userId: authUser.role === "Super Admin" ? authUser.id : authUser.userId });
    response.success_message(TaxRecords, res);
  } catch (error) {
    response.error_message(error.message, res);
  }
};

exports.othertaxList = async (req, res) => {
  const authUser = verify.verify_token(req.headers.token).details;
  try {
    const TaxRecords = await othertaxModel.find({ status: true, isDeleted: false, userId: authUser.role === "Super Admin" ? authUser.id : authUser.userId });
    response.success_message(TaxRecords, res);
  } catch (error) {
    response.error_message(error.message, res);
  }
};

exports.bankList = async (req, res) => {
  const authUser = verify.verify_token(req.headers.token).details;
  try {
    const bankRecords = await bankModel.find({ isDeleted: false, userId: authUser.role === "Super Admin" ? authUser.id : authUser.userId });
    response.success_message(bankRecords, res);
  } catch (error) {
    response.error_message(error.message, res);
  }
};

exports.roleList = async (req, res) => {
  const authUser = verify.verify_token(req.headers.token).details;
  try {
    const roleRecords = await roleModel.find({ isDeleted: false, userId: authUser.role === "Super Admin" ? authUser.id : authUser.userId });
    response.success_message(roleRecords, res);
  } catch (error) {
    response.error_message(error.message, res);
  }
};

exports.signatureList = async (req, res) => {
  const authUser = verify.verify_token(req.headers.token).details;
  try {
    const signatureRecords = await signatureModel.find({ isDeleted: false, status: true, userId: authUser.role === "Super Admin" ? authUser.id : authUser.userId }).lean();
    const modifiedSignatureList = signatureRecords.map(signature => ({
      ...signature,
      value: signature._id,
      label: signature.signatureName
    }));

    for (const item of modifiedSignatureList) {
      item.signatureImage = `${process.env.DEVLOPMENT_BACKEND_URL}/${item.signatureImage}`;
    }
    response.success_message(modifiedSignatureList, res);
  } catch (error) {
    response.error_message(error.message, res);
  }
};
