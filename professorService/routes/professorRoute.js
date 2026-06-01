const express = require("express");
const bcrypt = require("bcryptjs");
const Professor = require("../models/professor");
const { verifyRole, restrictProfessorToOwnData } = require("./auth/util");
const { ROLES } = require("../../consts");
const router = express.Router();

// Create professor (Public, e.g., self-registration)
router.post("/", async (req, res) => {
  const { name, email, phone, password } = req.body;
  if (!name || !email || !phone || !password) {
    return res
      .status(400)
      .json({ message: "Name, email, phone and password are required" });
  }

  try {
    const existingProfessor = await Professor.findOne({
      $or: [{ email }, { phone }],
    });
    if (existingProfessor) {
      return res
        .status(400)
        .json({ message: "Professor with this email or phone already exists" });
    }
    const newProfessor = new Professor({ name, email, phone, password });
    const savedProfessor = await newProfessor.save();
    res.status(201).json(savedProfessor);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get all professors (Admin or Auth Service only)
router.get("/", verifyRole([ROLES.ADMIN, ROLES.AUTH_SERVICE]), async (req, res) => {
  try {
    const professors = await Professor.find();
    return res.status(200).json(professors);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error, please try again" });
  }
});

// Get one professor by ID (Admin or the Professor themselves)
router.get("/:id", verifyRole([ROLES.ADMIN, ROLES.PROFESSOR]), restrictProfessorToOwnData, async (req, res) => {
  try {
    const foundProfessor = await Professor.findById(req.params.id);
    if (!foundProfessor) {
      return res.status(404).json({ message: "Professor not found" });
    }
    return res.status(200).json(foundProfessor);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error, please try again" });
  }
});

// Update one professor by ID (Admin or the Professor themselves)
router.put("/:id", verifyRole([ROLES.ADMIN, ROLES.PROFESSOR]), restrictProfessorToOwnData, async (req, res) => {
  try {
    const professor = await Professor.findById(req.params.id);
    if (!professor) {
      return res.status(404).json({ message: "Professor not found" });
    }

    if (req.body.name !== undefined) professor.name = req.body.name;
    if (req.body.email !== undefined) professor.email = req.body.email;
    if (req.body.phone !== undefined) professor.phone = req.body.phone;
    if (req.body.password !== undefined) professor.password = req.body.password;

    const updatedProfessor = await professor.save();
    return res.status(200).json({ message: "Professor updated", professor: updatedProfessor });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error, please try again" });
  }
});

// Delete one professor by ID (Admin only)
router.delete("/:id", verifyRole([ROLES.ADMIN]), async (req, res) => {
  try {
    const deletedProfessor = await Professor.findByIdAndDelete(req.params.id);
    if (!deletedProfessor) {
      return res.status(404).json({ message: "Professor not found" });
    }
    return res.status(200).json({ message: "Professor deleted successfully" });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: "Server error, please try again" });
  }
});

module.exports = router;
