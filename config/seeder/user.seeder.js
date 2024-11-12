const mongoose = require("mongoose");
const userModel = require("../../api/auth/models/auth.model");
const bcrypt = require("bcryptjs");

exports.userSeeding = async () => {
  try {
    const userRecord = await userModel.findOne().lean();
    if (userRecord) {
      return;
    } else {
      const hashedPassword = bcrypt.hashSync("Dgt@2023", 8);
      const hashedPasswordAdmin=bcrypt.hashSync("Admin@123", 8);

      const usersToCreate = [
        {
          fullname: "Super Admin",
          status: "Active",
          email: "superadmin@dreamstechnologies.com",
          password: hashedPassword,
          role: "Super Admin",
        },
        {
          fullname: "Admin",
          status: "Active",
          email: "admin@example.com",
          password: hashedPasswordAdmin,
          role: "Admin",
        }
      ];

      const userRec = await userModel.create(usersToCreate);

    }
  } catch (error) {
    console.log("error :", error);
  }
};
