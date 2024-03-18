import { Request, Response, NextFunction } from "express";
import { removeMeta } from "./dynamoObject";

export function cleanJsonMiddleware(
  _: Request,
  res: Response,
  next: NextFunction
) {
  const originalJson = res.json; // Store the original res.json method

  // Override res.json
  res.json = function (data) {
    const cleanedData = removeMeta(data); // Clean the data
    return originalJson.call(this, cleanedData); // Call the original res.json with cleaned data
  };

  next(); // Proceed to the next middleware
}
