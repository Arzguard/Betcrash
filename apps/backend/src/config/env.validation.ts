import * as Joi from 'joi';

export const envValidationSchema = Joi.object({
  DATABASE_URL: Joi.string().uri().required(),

  JWT_SECRET: Joi.string().min(32).required().messages({
    'string.min': 'JWT_SECRET must be at least 32 characters — use a strong random secret in production.',
    'any.required': 'JWT_SECRET is required.',
  }),

  JWT_REFRESH_SECRET: Joi.string().min(32).required().messages({
    'string.min': 'JWT_REFRESH_SECRET must be at least 32 characters.',
    'any.required': 'JWT_REFRESH_SECRET is required.',
  }),

  REDIS_HOST: Joi.string().default('localhost'),
  REDIS_PORT: Joi.number().integer().default(6379),

  PORT: Joi.number().integer().default(3333),

  CORS_ORIGINS: Joi.string().default('http://localhost:5500'),

  // M-Pesa — optional at startup, required at runtime for payment flows
  MPESA_CONSUMER_KEY: Joi.string().optional(),
  MPESA_CONSUMER_SECRET: Joi.string().optional(),
  MPESA_SHORTCODE: Joi.string().optional(),
  MPESA_PASSKEY: Joi.string().optional(),
  MPESA_CALLBACK_URL: Joi.string().uri().optional(),
  MPESA_ENV: Joi.string().valid('sandbox', 'production').default('sandbox'),
});
