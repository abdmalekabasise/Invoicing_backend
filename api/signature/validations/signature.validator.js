const { body, validationResult } = require('express-validator');
const response = require('../../../response');
const signatureModel = require("../models/signature.model");


exports.create = [

    body("signatureName").trim().notEmpty().withMessage("is required"),
    body("status").trim().notEmpty().withMessage("is required"),
    body("markAsDefault").trim().optional(),



    async (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            var error_message = [];
            errors.array().forEach(function (errorsList) {
                error_message.push(errorsList.param + " " + errorsList.msg);
            });
            data = {
                message: error_message,
            };
            response.validation_error_message(data, res);
        } else {
            next();
        }
    },
];