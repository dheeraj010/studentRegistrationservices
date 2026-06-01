const { createLogger, format, transports } = require("winston");
const { ElasticsearchTransport } = require("winston-elasticsearch");
const { getCorrelationId } = require("./correlationId"); // Function to retrieve the correlation ID

// Define custom log levels
const customLevels = {
  levels: {
    fatal: 0,
    error: 1,
    warn: 2,
    info: 3,
    debug: 4,
  },
};
// Elasticsearch transport configuration
const esTransport = (appName) => {
  let transporter = {
    level: "info", // Minimum log level to send to Elasticsearch
    clientOpts: {
      node: "https://83386f9cdb9344e4b48f096c72d6e7ec.us-central1.gcp.cloud.es.io:9243",
      auth: {
        username: "elastic",
        password: "3U98TZOa0lADaNKiY7KDmEon",
      },
    },
    indexPrefix: "sms-logs", // Logs will be stored in indices like "nodejs-logs-YYYY.MM.DD"
    transformer: (logData) => ({
      ...logData,
      timestamp: logData.timestamp || new Date().toISOString(),
      correlationId: getCorrelationId() || "N/A",
      appName, // Add additional metadata if needed
    }),
  };
  return transporter;
};

// Create the logger
const createDynamicLogger = (appName) => {
  const logger = createLogger({
    levels: customLevels.levels,
    format: format.combine(
      format.timestamp(),
      format.printf(({ level, message, timestamp }) => {
        // Add correlation ID to the log entry
        return JSON.stringify({
          timestamp,
          level,
          message,
          correlationId: getCorrelationId() || "N/A",
        });
      }),
    ),
    transports: [
      new transports.Console(), // Log to console
      new ElasticsearchTransport(esTransport(appName)), // Log to Elasticsearch
    ],
  });
  return logger;
};
let authServiceLogger = createDynamicLogger("authService");
let studentServiceLogger = createDynamicLogger("studentService");
let enrollementServiceLogger = createDynamicLogger("enrollmentService");
let courseServiceLogger = createDynamicLogger("courseService");
let professorServiceLogger = createDynamicLogger("professorService");
let gradeServiceLogger = createDynamicLogger("gradeService");
module.exports = {
  authServiceLogger,
  studentServiceLogger,
  enrollementServiceLogger,
  courseServiceLogger,
  professorServiceLogger,
  gradeServiceLogger,
};
