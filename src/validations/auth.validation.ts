import Joi from "joi";

export const registerSchema = Joi.object({
  email: Joi.string()
    .email()
    .required()
    .messages({
      "string.email": "Please provide a valid email address",
      "string.empty": "Email is required",
      "any.required": "Email is required",
    }),
  username: Joi.string().required().messages({
    "string.empty": "Username is required",
    "any.required": "Username is required",
  }),
  password: Joi.string().min(6).required().messages({
    "string.min": "Password must be at least 6 characters long",
    "string.empty": "Password is required",
    "any.required": "Password is required",
  }),
});

export const loginSchema = Joi.object({
  email: Joi.string()
    .email()
    .required()
    .messages({
      "string.email": "Please provide a valid email address",
      "string.empty": "Email is required",
      "any.required": "Email is required",
    }),
  password: Joi.string().required().messages({
    "string.empty": "Password is required",
    "any.required": "Password is required",
  }),
});

