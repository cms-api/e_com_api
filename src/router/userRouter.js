import express from "express";
import {
  findEmailExist,
  getAllAdmin,
  getOneAdmin,
  pushUser,
  updateActivation,
  updateById,
} from "../userDB/userModel.js";
import { comparePass, encryptPass } from "../encrypt/encryptPass.js";
import {
  loginValidation,
  newAdminValidation,
  newPasswordValidation,
  updateProfileValidation,
} from "../validation/joiValidation.js";
import {
  accountVerificationEmail,
  confirmOTP,
  confirmVerificationEmail,
} from "../nodemailer/nodemailer.js";
import { v4 as uuidv4 } from "uuid";
import {
  createAccessJWT,
  createOTPJWT,
  createRefreshToken,
} from "../JWT/jwt.js";
import { auth, refreshAuth } from "../middleware/authMiddleware.js";
import {
  deleteSessionByFilter,
  deleteSessionToken,
} from "../sessionModel/SessionModel.js";
import { otpRandomGenerator } from "../otpGenerator/otpGenerator.js";

import multer, { MulterError } from "multer";

const router = express.Router();

router.post("/", newAdminValidation, async (req, res, next) => {
  try {
    const { password, email } = req.body;
    const user = req.body;
    user.password = encryptPass(password);
    user.verificationCode = uuidv4(); //create unique id
    const userValid = await findEmailExist({ email });

    if (!userValid?._id) {
      const result = await pushUser(user);
      if (result?._id) {
        const link = `${process.env.WEB_DOMAIN}/admin-verification?c=${result.verificationCode}&e=${result.email}`;
        await accountVerificationEmail({
          fName: result.fName,
          email: result.email,
          link,
        });
        return res.json({
          status: "success",
          message: "Please check your email to activate you account",
        });
      }

      res.json({
        status: "error",
        message: "unable to crate account",
      });
    } else {
      return res.json({
        status: "error",
        message: "Unable to add new Admin",
      });
    }
  } catch (err) {
    err.statusCode = 400;
    const msg = err.message;
    if (msg.includes("E11000 duplicate key error")) {
      err.message =
        "This email is already used by another admin, use different email or reset your password";
    }
    next(err);

    // res.json({
    //   status: "error",
    //   message: err.message,
    // });
  }
});

router.get("/", loginValidation, async (req, res) => {
  try {
    console.log("input from req.body.login: ", req.body);
    const { email, password } = req.query;

    const data = await findEmailExist({ email });

    //find and check the user by email
    //check the password
    // create 2 jwts:
    /////create accessJWT amd storte in session table
    /////create refreshJWT amd storte in session table

    if (data?._id) {
      const passValidation = comparePass(password, data.password);
      if (passValidation) {
        const accessJWT = await createAccessJWT(email);
        const refreshJWT = await createRefreshToken(email);

        res.json({
          status: "success",
          message: "Success login",
          token: { accessJWT, refreshJWT },
        });
      } else {
        return res.json({
          status: "error",
          message: "password is wrong",
        });
      }
    } else {
      res.json({
        status: "error",
        message: "Email is not exist",
      });
    }
  } catch (err) {
    res.json({
      status: "error",
      message: err.message,
    });
  }
});

router.patch("/verify", async (req, res) => {
  try {
    const { email, code } = req.body;

    const respond = await updateActivation(
      { email, verificationCode: code },
      { isVerified: true, verificationCode: "", status: "active" }
    );
    if (respond?._id) {
      await confirmVerificationEmail(respond);
      res.json({
        status: "success",
        message: "success to verify",
        user: respond,
      });
    } else {
      res.json({
        status: "error",
        message: "Link has expired",
      });
    }
  } catch (error) {
    res.json({
      status: "error",
      message: error.message,
    });
  }
});

router.get("/getUser", auth, (req, res, next) => {
  try {
    res.json({
      status: "success",
      message: "here is the data",
      user: req.userInfo,
    });
  } catch (err) {
    next(err);
  }
});

//logout
router.post("/logout", (req, res, next) => {
  try {
    const { accessJWT, refreshJWT } = req.body;

    accessJWT && deleteSessionToken(accessJWT);
  } catch (err) {
    next(err);
  }
});

// create accessToken
router.get("/get-accessJWT", refreshAuth);

router.post("/admin-logout", async (req, res, next) => {
  try {
    const { _id, accessJWT, refreshJWT } = req.body;
    accessJWT && (await deleteSessionToken(accessJWT));

    if (refreshJWT && _id) {
      const result = await updateById({ _id, refreshJWT: "" });
    }
  } catch (err) {
    next(err);
  }
});

router.post("/get-OTP", async (req, res, next) => {
  try {
    const { email } = req.body;

    const user = await getOneAdmin({ email });
    if (user?._id) {
      const getOtp = otpRandomGenerator();
      console.log("step 1");
      const createToken = await createOTPJWT(email, getOtp);
      if (createToken?._id) {
        console.log("step 2");
        const sendOtpEmail = await confirmOTP({
          email,
          fName: user.fName,
          otp: getOtp,
        });
        return res.json({
          status: "success",
          message: "Please check your email to get the OTP",
        });
      }
    }
    return res.json({
      status: "error",
      message: "Email is not exist",
    });
  } catch (error) {
    next(error);
  }
});

router.post("/reset-pass", async (req, res, next) => {
  try {
    const { email, password, otp } = req.body;
    const result = await deleteSessionByFilter({
      token: otp,
      associate: email,
    });
    console.log("1.checking token OTP: ", result);
    if (result._id) {
      const user = await getOneAdmin({ email });
      console.log("2.check if user is exist: ", user);
      if (user?._id) {
        const newHidePass = encryptPass(password);
        const updatePass = await updateById({
          _id: user._id,
          password: newHidePass,
        });
        console.log("3.check if the data has been updated: ", updatePass);
        updatePass?._id
          ? res.json({
              status: "success",
              message: "Password has been changed",
            })
          : res.json({
              status: "error",
              message: "Password can not be updated or changed",
            });
      }
    }
  } catch (error) {
    next(error);
  }
});

router.get("/get-all-admin", async (req, res, next) => {
  try {
    const data = await getAllAdmin();
    if (data?.length) {
      return res.json({
        status: "success",
        message: "All admin data have been retrieved",
        data: data,
      });
    }
  } catch (error) {
    next(error);
  }
});

const targetImageStorage = "src/public/img/user-images";
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const error = null;
    //validation check
    cb(error, targetImageStorage);
  },
  filename: (req, file, cb) => {
    const error = null;
    const fileName = Date.now() + "-" + file.originalname;
    cb(error, fileName);
  },
});

const upload = multer({ storage });

router.put(
  "/update-profile",

  upload.single("image"),
  updateProfileValidation,
  auth,
  async (req, res, next) => {
    try {
      console.log(req.body._id);
      if (req?.file) {
        console.log(req?.file);
        req.body.image = req?.file?.path;
      }
      const { validationPassword, _id, ...rest } = req.body;
      const { email } = req.userInfo;
      const { password } = await getOneAdmin({ email });
      if (password) {
        const compare = comparePass(validationPassword, password);
        if (compare) {
          const result = await updateById({ _id, ...rest });
          result?._id
            ? res.json({
                status: "success",
                message: "profile has been updated",
              })
            : res.json({
                status: "success",
                message: "data can not be updated",
              });
        } else {
          return res.json({
            status: "error",
            message: "Password is incorrect",
          });
        }
      }
    } catch (err) {
      next(err);
    }
  }
);

router.patch(
  "/new-password",
  newPasswordValidation,
  auth,
  async (req, res, next) => {
    try {
      const { newPassword, currentPassword } = req.body;
      const { email } = req.userInfo;
      const adminData = await getOneAdmin({ email });
      if (adminData?._id) {
        const comparePassResult = comparePass(
          currentPassword,
          adminData.password
        );
        console.log(comparePassResult);
        if (comparePassResult) {
          const encryptPassResult = encryptPass(newPassword);
          const pushNewPassword = await updateById({
            _id: adminData._id,
            password: encryptPassResult,
          });
          pushNewPassword?._id
            ? res.json({
                status: "success",
                message: "password has been updated",
              })
            : res.json({
                status: "error",
                message: "password can not be updated",
              });
        } else {
          res.json({
            status: "error",
            message: "password is not match with previous password",
          });
        }
      } else {
        return res.json({
          status: "error",
          message: "email is not found",
        });
      }
    } catch (err) {
      next(err);
    }
  }
);
export default router;
