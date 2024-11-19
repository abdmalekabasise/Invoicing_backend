const response = require("../../../../response");
const purchaseTemplateModel = require("../models/purchase_template.model");
const verify = require("../../../../verify.token");


exports.updatePurchaseTemplate = async (req, res) => {
  try {
    const request = req.body;
    const authUser = verify.verify_token(req.headers.token).details;

    const filter = { userId: authUser.role === "Super Admin" ? authUser.id : authUser.userId };
    const update = {
      default_purchase_template: request.default_purchase_template,
      userId: authUser.role === "Super Admin" ? authUser.id : authUser.userId
    };
    const options = { new: true, upsert: true };

    const purchaseTemplateRec = await purchaseTemplateModel.findOneAndUpdate(filter, update, options);

    let data = {
      updatedData: purchaseTemplateRec,
    };
    response.success_message(data, res);
  } catch (error) {
    response.error_message(error.message, res);
  }
};

exports.viewPurchaseTemplate = async (req, res) => {
  try {
    const authUser = verify.verify_token(req.headers.token).details;
    const purchaseTemplateRecord = await purchaseTemplateModel
      .findOne({
        userId: authUser.role === "Super Admin" ? authUser.id : authUser.userId
      })
      .lean();
    if (purchaseTemplateRecord == null) {
      const obj = {
        default_purchase_template: "",
      };
      response.success_message(obj, res);
    }
    else {
      response.success_message(purchaseTemplateRecord, res)
    }
  } catch (error) {
    response.error_message(error.message, res);
  }
};
