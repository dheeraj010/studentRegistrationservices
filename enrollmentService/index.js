const express = require("express");
const dotenv = require("dotenv");
const connectDB = require("./config/db");

const enrollmentRoutes = require("./routes/enrollmentRoute");

const publicKeyRoute = require("./routes/auth/publicKeyRoute");

dotenv.config();

// Initialize express app
const app = express();

// Connect to database
connectDB();

// Middleware
app.use(express.json());

const { correlationIdMiddleware, getCorrelationId } = require("../correlationId");
const { enrollementServiceLogger } = require("../logging");

// Correlation ID middleware
app.use(correlationIdMiddleware);

// Request logging
app.use((req, res, next) => {
  enrollementServiceLogger.info(`${req.method} ${req.originalUrl} - cid:${getCorrelationId()}`);
  next();
});

app.use("/.well-known/jwks.json", publicKeyRoute);
app.use("/api/enrollments", enrollmentRoutes);

// Error handler
app.use((err, req, res, next) => {
  enrollementServiceLogger.error(`Unhandled error: ${err && err.message} - cid:${getCorrelationId()}`);
  res.status(500).json({ message: "Internal Server Error" });
});

// Start server
const PORT = process.env.PORT || 5005;
app.listen(PORT, () => {
  enrollementServiceLogger.info(`Enrollment running on port ${PORT}`);
});
