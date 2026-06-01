const express = require("express");
const dotenv = require("dotenv");
const connectDB = require("./config/db");

const professorRoute = require("./routes/professorRoute");

dotenv.config();

// Initialize express app
const app = express();

// Connect to database
connectDB();

// Middleware
app.use(express.json());

const { correlationIdMiddleware, getCorrelationId } = require("../correlationId");
const { professorServiceLogger } = require("../logging");

// Correlation ID middleware
app.use(correlationIdMiddleware);

// Request logging
app.use((req, res, next) => {
  professorServiceLogger.info(`${req.method} ${req.originalUrl} - cid:${getCorrelationId()}`);
  next();
});

app.use("/api/professors", professorRoute);

// Error handler
app.use((err, req, res, next) => {
  professorServiceLogger.error(`Unhandled error: ${err && err.message} - cid:${getCorrelationId()}`);
  res.status(500).json({ message: "Internal Server Error" });
});

// Start server
const PORT = process.env.PORT || 5003;
app.listen(PORT, () => {
  professorServiceLogger.info(`Professor Server running on port ${PORT}`);
});
