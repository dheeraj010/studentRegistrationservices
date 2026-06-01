const express = require("express");
const bcrypt = require("bcryptjs");
const dotenv = require("dotenv");

const {
  generateJWTWithPrivateKey,
  fetchStudents,
  fetchProfessors,
} = require("./util");
const { ROLES } = require("../../../consts");

const router = express.Router();

dotenv.config();

const axios = require("axios");
const { getCorrelationId } = require("../../../correlationId");
const { authServiceLogger } = require("../../../logging");

// // Student Login
// router.post("/student", async (req, res) => {
//   const { email, password } = req.body;

//   try {
//     if (!email || !password) {
//       return res
//         .status(400)
//         .json({ message: "Email and password are required" });
//     }
//   } catch (error) {
//     console.log(error);
//     res.status(500).json({ message: "Server error" });
//   }
// });


router.post("/student", async (req, res) => {
  const { email, password } = req.body;
 
  try {
    if (!email || !password) {
      return res
        .status(400)
        .json({ message: "Email and password are required" });
    }
    // Get the list of students
    const students = await fetchStudents();
    const student = students.find((s) => s.email === email);
 
    if (!student) {
      return res.status(404).json({ message: "Student not found" });
    }
    const isMatch = await bcrypt.compare(password, student.password);
 
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid Credentials" });
    }
    // generate a token
    const token = generateJWTWithPrivateKey({
      id: student._id,
      roles: [ROLES.STUDENT],
    });
    return res.status(201).json({ access_token: token });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: "Server error" });
  }
});


// Professor Login
router.post("/professor", async (req, res) => {
  const { email, password } = req.body;

  try {
    if (!email || !password) {
      return res
        .status(400)
        .json({ message: "Email and password are required" });
    }

    const professors = await fetchProfessors();
    const professor = professors.find((p) => p.email === email);

    if (!professor) {
      return res.status(404).json({ message: "Professor not found" });
    }

    const isMatch = await bcrypt.compare(password, professor.password);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid Credentials" });
    }

    const token = generateJWTWithPrivateKey({
      id: professor._id,
      roles: [ROLES.PROFESSOR],
    });

    return res.status(200).json({ access_token: token });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

// Admin Login
router.post("/admin", async (req, res) => {
  const { email, password } = req.body;

  try {
    if (!email || !password) {
      return res
        .status(400)
        .json({ message: "Email and password are required" });
    }

    const adminEmail = "admin@gmail.com";
    const adminPassword = process.env.ADMIN_PASSWORD;

    if (email !== adminEmail || password !== adminPassword) {
      return res.status(401).json({ message: "Invalid Credentials" });
    }

    const token = generateJWTWithPrivateKey({
      id: "admin",
      roles: [ROLES.ADMIN],
    });

    return res.status(200).json({ access_token: token });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Server error" });
  }
});

module.exports = router;

// Debug route to simulate an outgoing failing request and demonstrate correlation propagation
router.get("/debug/error-propagate", async (req, res) => {
  try {
    // Intentionally call an invalid endpoint to produce an error and show correlation id propagation
    await axios.get("http://localhost:5999/boom", {
      headers: { "x-correlation-id": getCorrelationId() },
      timeout: 2000,
    });
    res.status(200).json({ message: "unexpectedly succeeded" });
  } catch (err) {
    authServiceLogger.error(`Debug outgoing error: ${err && err.message} - cid:${getCorrelationId()}`);
    res.status(500).json({ message: "Debug: propagated error (see logs for correlation id)" });
  }
});
