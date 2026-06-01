const jwt = require("jsonwebtoken");
const dotenv = require("dotenv");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const jwkToPem = require("jwk-to-pem");

const { getCorrelationId } = require("../../../correlationId");
const { gradeServiceLogger } = require("../../../logging");
const {
  ROLES,
  STUDENT_SERVICE,
  COURSE_SERVICE,
  ENROLLMENT_SERVICE,
} = require("../../../consts");

dotenv.config();

const axiosInstance = axios.create();

// Propagate correlation ID on outgoing requests and log them
axiosInstance.interceptors.request.use((config) => {
  try {
    const cid = getCorrelationId();
    if (cid) config.headers["x-correlation-id"] = cid;
    gradeServiceLogger.debug(
      `Outgoing request ${config.method} ${config.url} - cid:${cid}`
    );
  } catch (e) {
    // ignore
  }
  return config;
});

axiosInstance.interceptors.response.use(
  (res) => res,
  (err) => {
    try {
      const cid = getCorrelationId();
      gradeServiceLogger.error(
        `Outgoing request failed: ${err && err.message} - cid:${cid}`
      );
    } catch (e) {}
    return Promise.reject(err);
  }
);

const kid = "1";
const jku = `http://localhost:${process.env.PORT}/.well-known/jwks.json`;

// Define additional headers
const customHeaders = {
  kid,
  jku,
};

// Path to your private and public keys
const privateKey = fs.readFileSync(
  path.join(__dirname, "../auth/keys/private.key"),
  "utf8"
);
const publicKey = fs.readFileSync(
  path.join(__dirname, "../auth/keys/public.key"),
  "utf8"
);

// Trusted domains to prevent SSRF
const trustedDomains = ["http://localhost:"];

/**
 * Fetch the JWKS from a given URI.
 * @param {string} jku - The JWKS URI from the JWT header.
 * @returns {Promise<Array>} - A promise that resolves to the JWKS keys.
 */
async function fetchJWKS(jku) {
  const response = await axiosInstance.get(jku);
  return response.data.keys;
}

/**
 * Get the public key from JWKS and convert it to PEM format.
 * @param {string} kid - The key ID from the JWT header.
 * @param {Array} keys - The JWKS keys.
 * @returns {string} - The corresponding public key in PEM format.
 */
function getPublicKeyFromJWKS(kid, keys) {
  const key = keys.find((k) => k.kid === kid);

  if (!key) {
    throw new Error("Unable to find a signing key that matches the 'kid'");
  }

  return jwkToPem(key);
}

/**
 * Verify a JWT token using the JWKS URI in the `jku` header.
 * @param {string} token - The JWT token to verify.
 * @returns {Promise<object>} - A promise that resolves to the decoded JWT payload.
 */
async function verifyJWTWithJWKS(token) {
  const decodedHeader = jwt.decode(token, { complete: true }).header;
  const { kid, alg, jku } = decodedHeader;

  if (!kid || !jku) {
    throw new Error("JWT header is missing 'kid' or 'jku'");
  }

  if (alg !== "RS256") {
    throw new Error(`Unsupported algorithm: ${alg}`);
  }

  // Ensure jku is from a trusted domain to prevent SSRF
  if (!trustedDomains.some((domain) => jku.startsWith(domain))) {
    throw new Error("Domain not supported / untrusted JKU");
  }

  const keys = await fetchJWKS(jku);
  const publicKey = getPublicKeyFromJWKS(kid, keys);

  return jwt.verify(token, publicKey, { algorithms: ["RS256"] });
}

// Generate a JWT using the private key (for service-to-service calls)
function generateJWTWithPrivateKey(payload) {
  const token = jwt.sign(payload, privateKey, {
    algorithm: "RS256",
    header: customHeaders,
    expiresIn: "6h",
  });
  return token;
}

// Role-based Access Control Middleware
function verifyRole(requiredRoles) {
  return async (req, res, next) => {
    const token =
      req.headers.authorization && req.headers.authorization.split(" ")[1];

    if (!token) {
      return res
        .status(401)
        .json({ message: "Authorization token is missing" });
    }

    try {
      const decoded = await verifyJWTWithJWKS(token);
      req.user = decoded;

      const userRoles = req.user.roles || [];
      const hasRequiredRole = userRoles.some((role) =>
        requiredRoles.includes(role)
      );
      if (hasRequiredRole) {
        return next();
      } else {
        return res
          .status(403)
          .json({ message: "Access forbidden: Insufficient role" });
      }
    } catch (error) {
      console.error(error);
      return res
        .status(403)
        .json({ message: "Invalid or expired token", error: error.message });
    }
  };
}

// Fetch a student by ID from the student service
async function fetchStudentById(studentId) {
  let token = generateJWTWithPrivateKey({
    id: ROLES.GRADE_SERVICE,
    roles: [ROLES.GRADE_SERVICE],
  });
  const response = await axiosInstance.get(`${STUDENT_SERVICE}/${studentId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  return response.data;
}

// Fetch a course by ID from the course service
async function fetchCourseById(courseId) {
  let token = generateJWTWithPrivateKey({
    id: ROLES.GRADE_SERVICE,
    roles: [ROLES.GRADE_SERVICE],
  });
  const response = await axiosInstance.get(`${COURSE_SERVICE}/${courseId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  return response.data;
}

// Look up an enrollment by student and course from the enrollment service
async function fetchEnrollmentByStudentAndCourse(studentId, courseId) {
  let token = generateJWTWithPrivateKey({
    id: ROLES.GRADE_SERVICE,
    roles: [ROLES.GRADE_SERVICE],
  });
  const response = await axiosInstance.get(
    `${ENROLLMENT_SERVICE}/lookup?student=${studentId}&course=${courseId}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );
  return response.data;
}

function restrictStudentToOwnData(req, res, next) {
  if (req.user.roles.includes(ROLES.STUDENT) && req.user.id !== req.params.studentId) {
    return res.status(403).json({
      message: "Access forbidden: You can only access your own data",
    });
  }
  next();
}

module.exports = {
  kid,
  verifyRole,
  restrictStudentToOwnData,
  fetchStudentById,
  fetchCourseById,
  fetchEnrollmentByStudentAndCourse,
  generateJWTWithPrivateKey,
};
