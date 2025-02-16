const express = require("express");
const router = express.Router();
const multer = require("multer");
const sharp = require("sharp");
const fs = require("fs");
const path = require("path");
const purchaseController = require("../controllers/purchase.controller");
const purchaseValidator = require("../validations/purchase.validator");
const deleteValidator = require("../../common/validators");
const checkAccess = require("../../../middleware/permission.middleware");

const uploadImage = async (req, res, next) => {
  const storage = multer.diskStorage({
    destination: function (req, file, cb) {
      cb(null, "./uploads/purchases");
    },
    filename: function (req, file, cb) {
      const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
      const ext = path.extname(file.originalname);
      cb(null, file.fieldname + "-" + uniqueSuffix + ext);
    },
  });

  const upload = multer({
    storage: storage,
    limits: {
      fileSize: 1024 * 1024 * 5, // 5 MB
    },
    fileFilter: (req, file, cb) => {
      if (
        file.mimetype == "image/png" ||
        file.mimetype == "image/jpg" ||
        file.mimetype == "image/jpeg"
      ) {
        cb(null, true);
      } else {
        return cb(
          new Error(
            "Only files with the following extensions are allowed: png,jpg,jpeg "
          )
        );
      }
    },
  });

  const uploadSingleImage = upload.single("signatureImage");
  uploadSingleImage(req, res, function (err) {
    if (err) {
      data = {
        message: err.message,
      };
      return response.validation_error_message(data, res);
    }
    next();
  });
};

// Define middleware to resize the uploaded image using sharp
const resizeImage = async (req, res, next) => {
  if (req.file) {
    try {
      const imagePath = req.file.path;
      const resizedPath = imagePath.replace(
        path.extname(imagePath),
        "-resized" + path.extname(imagePath)
      );
      await sharp(imagePath).resize(40).toFile(resizedPath);
      fs.unlinkSync(imagePath);
      fs.renameSync(resizedPath, imagePath);
    } catch (error) {
      console.log(error);
    }
  }
  next();
};

router.post(
  "/addPurchase",
  checkAccess.checkAccess("purchase", "create"),
  uploadImage,
  resizeImage,
  purchaseValidator.create,
  purchaseController.create
);
router.put(
  "/updatePurchase/:id",
  checkAccess.checkAccess("purchase", "update"),
  uploadImage,
  resizeImage,
  purchaseValidator.update,
  purchaseController.update
);
router.get(
  "/listPurchases",
  checkAccess.checkAccess("purchase", "view"),
  purchaseController.list
);
router.get(
  "/viewPurchase/:id",
  checkAccess.checkAccess("purchase", "view"),
  purchaseController.view
);
router.post(
  "/deletePurchase",
  checkAccess.checkAccess("purchase", "delete"),
  deleteValidator._idValidator,
  purchaseController.delete
);
router.get("/getPurchaseNumber", purchaseController.getPurchaseOrderNumber);
module.exports = router;
