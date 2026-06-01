const express = require("express");
const dotenv = require("dotenv");
const rateLimit = require("express-rate-limit");
const connectDB = require("./config/db");
const studentRoutes = require("./routes/studentRoute");

dotenv.config();

// Connect DB
connectDB();

// Create Express app
const app = express();

// Middleware
app.use(express.json());

const { correlationIdMiddleware, getCorrelationId } = require("../correlationId");
const { studentServiceLogger } = require("../logging");

// Correlation ID middleware
app.use(correlationIdMiddleware);

// Rate limiting
app.use(rateLimit({
  windowMs: 60 * 1000, // 1 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: "Too many requests from this IP, please try again later",
  headers: true, // Include rate limit info in response headers
}));

// Request logging
app.use((req, res, next) => {
    studentServiceLogger.info(`${req.method} ${req.originalUrl} - cid:${getCorrelationId()}`);
    next();
});

// Routes
app.use("/api/students", studentRoutes);

// Error handler
app.use((err, req, res, next) => {
    studentServiceLogger.error(`Unhandled error: ${err && err.message} - cid:${getCorrelationId()}`);
    res.status(500).json({ message: "Internal Server Error" });
});

const PORT = process.env.PORT || 5003;

app.listen(PORT, () => {
    studentServiceLogger.info(`Student Service is running on port ${PORT}`);
});