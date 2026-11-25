import multer from "multer";
import path from "path";
import fs from "fs"
import { v2 as cloudinary } from "cloudinary";
import getEnvs from "../config"
import { logger } from "../utils/logger";

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(process.cwd(), "/uploads"));
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + "-" + uniqueSuffix);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    // Images (profile photos / icons) and PDFs (medical reports) only
    if (/^image\/(png|jpe?g|webp|gif|svg\+xml)$/.test(file.mimetype) || file.mimetype === "application/pdf") cb(null, true);
    else cb(new Error("Only image or PDF uploads are allowed"));
  },
});

const uploadToCloudinary = async (file: Express.Multer.File) => {

  cloudinary.config({
    cloud_name: getEnvs.cloudinary.cloudinary_cloud_name,
    api_key: getEnvs.cloudinary.cloudinary_api_key,
    api_secret: getEnvs.cloudinary.cloudinary_api_secret,
  });

  try {
    const result = await cloudinary.uploader.upload(file.path, {
      public_id: file.filename,
    });

    if (result.secure_url) {
      fs.unlinkSync(file.path)
    }
    
    return result;
  } catch (error) {
    if (fs.existsSync(file.path)) fs.unlinkSync(file.path)
    logger.error("Cloudinary upload failed", { err: error as Error });
  }
};

export const fileUploader = {
  upload,
  uploadToCloudinary,
};
