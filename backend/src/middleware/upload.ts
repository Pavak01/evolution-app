import multer from "multer";
import { allowedReceiptMimeTypes, maxReceiptSizeBytes } from "../config.js";

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: maxReceiptSizeBytes },
  fileFilter: (_req, file, cb) => {
    if (!allowedReceiptMimeTypes.has(file.mimetype)) {
      cb(new Error("Unsupported receipt file type"));
      return;
    }
    cb(null, true);
  }
});
