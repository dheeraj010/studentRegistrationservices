const express = require("express");
const router = express.Router();
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { kid } = require("./util");

// Path to your private and public keys
const publicKey = fs.readFileSync(
  path.join(__dirname, "../auth/keys/public.key"),
  "utf8"
);

// JWKS endpoint (to expose the public key in JWK format)
router.get("/", (req, res) => {
  try {
    const jwk = crypto.createPublicKey(publicKey).export({ format: "jwk" });
    const publicJWK = {
      keys: [
        {
          kty: jwk.kty,
          kid, // Key ID, used to identify the key
          use: "sig", // Key use (signature)
          alg: "RS256", // Algorithm
          n: jwk.n,
          e: jwk.e,
        },
      ],
    };
    res.json(publicJWK);
  } catch (error) {
    console.error("Error generating JWK:", error);
    res.status(500).json({ message: "Server error generating JWK" });
  }
});

module.exports = router;
