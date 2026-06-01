const express = require("express");
const dotenv = require("dotenv");
const rateLimit = require("express-rate-limit");

const publicKeyRoute = require("./routes/auth/publicKeyRoute");
const loginRoute = require("./routes/auth/loginRoute");

dotenv.config();

// Initialize express app
const app = express();

// Middleware
app.use(express.json());

const { correlationIdMiddleware, getCorrelationId } = require("../correlationId");
const { authServiceLogger } = require("../logging");

// Correlation ID middleware (adds/propagates `x-correlation-id`)
app.use(correlationIdMiddleware);

// Rate limiting
const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: "Too many requests from this IP, please try again later",
  headers: true, // Include rate limit info in response headers
});

// Public Key (mount BEFORE rate limiter so other services can fetch JWKS)
app.use("/.well-known/jwks.json", publicKeyRoute);

// Rate limiting
app.use(limiter);

// Request logging
app.use((req, res, next) => {
  authServiceLogger.info(`${req.method} ${req.originalUrl} - cid:${getCorrelationId()}`);
  next();
});

// Routes
app.use("/api/login", loginRoute);

// Error handler (logs with correlation id)
app.use((err, req, res, next) => {
  authServiceLogger.error(`Unhandled error: ${err && err.message} - cid:${getCorrelationId()}`);
  res.status(500).json({ message: "Internal Server Error" });
});

// Start server
const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
  authServiceLogger.info(`Auth Server running on port ${PORT}`);
});
