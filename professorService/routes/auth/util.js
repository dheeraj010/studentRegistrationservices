const jwt = require("jsonwebtoken");
const dotenv = require("dotenv");
const axios = require("axios");
const { getCorrelationId } = require("../../../correlationId");
const { professorServiceLogger } = require("../../../logging");
const jwkToPem = require("jwk-to-pem");
const { ROLES } = require("../../../consts");

dotenv.config();

// Trusted domains to prevent SSRF
const trustedDomains = ["http://localhost:"];

/**
 * Fetch the JWKS from a given URI.
 * @param {string} jku - The JWKS URI from the JWT header.
 * @returns {Promise<Array>} - A promise that resolves to the JWKS keys.
 */
const axiosInstance = axios.create();
axiosInstance.interceptors.request.use((config) => {
  try {
    const cid = getCorrelationId();
    if (cid) config.headers["x-correlation-id"] = cid;
    professorServiceLogger.debug(`Outgoing request ${config.method} ${config.url} - cid:${cid}`);
  } catch (e) {}
  return config;
});
axiosInstance.interceptors.response.use((r) => r, (err) => {
  try { professorServiceLogger.error(`Outgoing request failed: ${err && err.message} - cid:${getCorrelationId()}`); } catch(e){}
  return Promise.reject(err);
});

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

// Role-based Access Control Middleware
function verifyRole(requiredRoles) {
  return async (req, res, next) => {
    const token =
      req.headers.authorization && req.headers.authorization.split(" ")[1]; // Extract token from 'Bearer <token>'

    if (!token) {
      return res
        .status(401)
        .json({ message: "Authorization token is missing" });
    }

    try {
      // Step 1: Verify the JWT token using JWKS
      const decoded = await verifyJWTWithJWKS(token); // Decode the token and get the payload
      req.user = decoded; // Attach the decoded payload (user data) to the request object

      // Step 2: Check if the user has any of the required roles
      const userRoles = req.user.roles || [];
      const hasRequiredRole = userRoles.some((role) =>
        requiredRoles.includes(role)
      );
      if (hasRequiredRole) {
        return next(); // User has at least one of the required roles, so proceed
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

function restrictProfessorToOwnData(req, res, next) {
  if (
    req.user.roles.includes(ROLES.PROFESSOR) &&
    req.user.id !== req.params.id
  ) {
    return res.status(403).json({
      message: "Access forbidden: You can only access your own data",
    });
  }
  next();
}

module.exports = {
  verifyRole,
  restrictProfessorToOwnData,
};
