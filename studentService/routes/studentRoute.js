const express = require("express");
const Student = require("../models/student");
const { verifyRole, restrictStudentToOwnData } = require("./auth/util");
const { ROLES } = require("../../consts");
const { studentServiceLogger: logger } = require("../../logging");

const router = express.Router();

// Create student (Public, e.g., self-registration)
router.post("/", async (req, res) => {
  const { name, email, password } = req.body;
  logger.info("Received request to create a new student.");

  if (!name || !email || !password) {
    logger.warn("Student creation failed. Name, email, and password are required.");
    return res
      .status(400)
      .json({ message: "Name, email and password are required" });
  }

  try {
    logger.info("Checking if a student with this email already exists.");
    const existingStudent = await Student.findOne({ email });
    if (existingStudent) {
      logger.warn("Student creation blocked. A student with this email already exists.");
      return res
        .status(400)
        .json({ message: "Student with this email already exists" });
    }
    const newStudent = new Student({ name, email, password });
    const savedStudent = await newStudent.save();
    logger.info("New student created and saved successfully.");
    res.status(201).json(savedStudent);
  } catch (error) {
    logger.error("Something went wrong while creating the student. " + error.message);
    res.status(500).json({ message: error.message });
  }
});

// Get all students (Admin, Professor, Enrollment Service, or Auth Service only)
router.get("/", verifyRole([ROLES.ADMIN, ROLES.PROFESSOR, ROLES.ENROLLMENT_SERVICE, ROLES.AUTH_SERVICE]), async (req, res) => {
  logger.info("Received request to fetch all students.");
  try {
    const students = await Student.find();
    logger.info("Successfully fetched all students.");
    return res.status(200).json(students);
  } catch (error) {
    logger.error("Failed to fetch students. " + error.message);
    return res.status(500).json({ message: "Server error, please try again" });
  }
});

// Get one student by ID (Admin, Professor, Student, Enrollment Service, or Grade Service)
router.get("/:id", verifyRole([ROLES.ADMIN, ROLES.PROFESSOR, ROLES.STUDENT, ROLES.ENROLLMENT_SERVICE, ROLES.GRADE_SERVICE]), restrictStudentToOwnData, async (req, res) => {
  const { id } = req.params;
  logger.info("Received request to fetch student with ID: " + id);
  try {
    const foundStudent = await Student.findById(id);
    if (!foundStudent) {
      logger.warn("No student found with ID: " + id);
      return res.status(404).json({ message: "Student not found" });
    }
    logger.info("Student found and returned successfully.");
    return res.status(200).json(foundStudent);
  } catch (error) {
    logger.error("Error while fetching student with ID: " + id + ". " + error.message);
    return res.status(500).json({ message: "Server error, please try again" });
  }
});

// Update one student by ID (Admin or the Student themselves)
router.put("/:id", verifyRole([ROLES.ADMIN, ROLES.STUDENT]), restrictStudentToOwnData, async (req, res) => {
  const { id } = req.params;
  logger.info("Received request to update student with ID: " + id);
  try {
    const student = await Student.findById(id);
    if (!student) {
      logger.warn("Cannot update. No student found with ID: " + id);
      return res.status(404).json({ message: "Student not found" });
    }

    if (req.body.name !== undefined) student.name = req.body.name;
    if (req.body.email !== undefined) student.email = req.body.email;
    if (req.body.password !== undefined) student.password = req.body.password;
    if (req.body.courses !== undefined) student.courses = req.body.courses;

    logger.info("Saving updated student data.");
    const updatedStudent = await student.save();
    logger.info("Student updated successfully.");
    return res.status(200).json({ message: "Student updated", student: updatedStudent });
  } catch (error) {
    logger.error("Error while updating student with ID: " + id + ". " + error.message);
    return res.status(500).json({ message: "Server error, please try again" });
  }
});

// Delete one student by ID (Admin only)
router.delete("/:id", verifyRole([ROLES.ADMIN]), async (req, res) => {
  const { id } = req.params;
  logger.info("Received request to delete student with ID: " + id);
  try {
    const deletedStudent = await Student.findByIdAndDelete(id);
    if (!deletedStudent) {
      logger.warn("Cannot delete. No student found with ID: " + id);
      return res.status(404).json({ message: "Student not found" });
    }
    logger.info("Student deleted successfully.");
    return res.status(200).json({ message: "Student deleted successfully" });
  } catch (error) {
    logger.error("Error while deleting student with ID: " + id + ". " + error.message);
    return res.status(500).json({ message: "Server error, please try again" });
  }
});

module.exports = router;
