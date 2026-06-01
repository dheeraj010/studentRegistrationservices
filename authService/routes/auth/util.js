const fs = require("fs");
const jwt = require("jsonwebtoken");
const path = require("path");
const dotenv = require("dotenv");
const axios = require("axios");
const { getCorrelationId } = require("../../../correlationId");
const { authServiceLogger } = require("../../../logging");
const {
  STUDENT_SERVICE,
  PROFESSOR__SERVICE,
  ROLES,
} = require("../../../consts");

dotenv.config();

// Path to your private and public keys
const privateKey = fs.readFileSync(
  path.join(__dirname, "../auth/keys/private.key"),
  "utf8"
);
const publicKey = fs.readFileSync(
  path.join(__dirname, "../auth/keys/public.key"),
  "utf8"
);

const kid = "1";
const jku = `http://localhost:${process.env.PORT}/.well-known/jwks.json`;

// Define additional headers
const customHeaders = {
  kid, // Replace with the actual Key ID
  jku, // Replace with your JWKS URL
};

// Generate a JWT using the private key
function generateJWTWithPrivateKey(payload) {
  return jwt.sign(payload, privateKey, {
    algorithm: "RS256",
    expiresIn: "1h",
    header: customHeaders,
  });
}

// JWT verification function
function verifyJWTWithPublicKey(token) {
  try {
    return jwt.verify(token, publicKey, { algorithms: ["RS256"] });
  } catch (err) {
    throw new Error("Invalid token");
  }
}

// JWKS helpers (optional, for federated JWT verification)
const trustedDomain = ["http://localhost:"];
const axiosInstance = axios.create();
axiosInstance.interceptors.request.use((config) => {
  try {
    const cid = getCorrelationId();
    if (cid) config.headers["x-correlation-id"] = cid;
    authServiceLogger.debug(`Outgoing request ${config.method} ${config.url} - cid:${cid}`);
  } catch (e) {}
  return config;
});
axiosInstance.interceptors.response.use((r) => r, (err) => {
  try { authServiceLogger.error(`Outgoing request failed: ${err && err.message} - cid:${getCorrelationId()}`); } catch(e){}
  return Promise.reject(err);
});

async function fetchJWKS(jku) {
  const res = await axiosInstance.get(jku);
  return res.data.keys;
}
function getPublicKeyFromJWKS(kid, keys) {
  const key = keys.find((k) => k.kid === kid);
  if (!key) throw new Error("Key not found in JWKS");
  // Only supports RSA keys (x5c)
  return `-----BEGIN PUBLIC KEY-----\n${key.x5c[0]}\n-----END PUBLIC KEY-----`;
}
async function verifyJWTWithJWKS(token) {
  const decodedHeader = jwt.decode(token, { complete: true }).header;
  const { kid, alg, jku } = decodedHeader;

  if (!kid || !jku) {
    throw new Error("JWT header is missing 'kid' or 'jku'");
  }

  if (!trustedDomain.some(domain => jku.startsWith(domain))) {
    throw new Error("Domain not supported");
  }

  if (alg !== "RS256") {
    throw new Error(`Unsupported algorithm: ${alg}`);
  }

  const keys = await fetchJWKS(jku);
  const publicKey = getPublicKeyFromJWKS(kid, keys);

  return jwt.verify(token, publicKey, { algorithms: ["RS256"] });
}

async function fetchStudents() {
  const token = generateJWTWithPrivateKey({
    id: ROLES.AUTH_SERVICE,
    roles: [ROLES.AUTH_SERVICE],
  });
  const response = await axiosInstance.get(STUDENT_SERVICE, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  return response.data;
}

async function fetchProfessors() {
  const token = generateJWTWithPrivateKey({
    id: ROLES.AUTH_SERVICE,
    roles: [ROLES.AUTH_SERVICE],
  });
  const response = await axiosInstance.get(PROFESSOR__SERVICE, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  return response.data;
}

function verifyRole(requiredRole) {
  return (req, res, next) => {
    const token = req.headers.authorization && req.headers.authorization.split(" ")[1];
    if (!token) {
      return res.status(401).json({ message: "authorization token missing" });
    }
    try {
      const decoded = verifyJWTWithPublicKey(token);
      if (!decoded.role || decoded.role !== requiredRole) {
        return res.status(403).json({ message: "forbidden: insufficient role" });
      }
      req.user = decoded;
      next();
    } catch (err) {
      return res.status(401).json({ message: "invalid or expired token" });
    }
  };
}

module.exports = {
  kid,
  generateJWTWithPrivateKey,
  verifyJWTWithPublicKey,
  verifyJWTWithJWKS,
  fetchStudents,
  fetchProfessors,
  verifyRole,
};
