const express = require("express");
const Grade = require("../models/grade");
const router = express.Router();

const {
  verifyRole,
  restrictStudentToOwnData,
  fetchStudentById,
  fetchCourseById,
  fetchEnrollmentByStudentAndCourse,
} = require("./auth/util");
const { ROLES } = require("../../consts");
const { gradeServiceLogger: logger } = require("../../logging");

// Assign a grade to a student for a course (Admin and Professor only)
router.post(
  "/",
  verifyRole([ROLES.ADMIN, ROLES.PROFESSOR]),
  async (req, res) => {
    try {
      const { student, course, grade, score, remarks } = req.body;

      logger.info("Received request to assign a grade.");

      // Validate required fields
      if (!student || !course || !grade) {
        logger.warn("Grade assignment failed. Student, course, and grade are required.");
        return res
          .status(400)
          .json({ message: "Student, course, and grade are required" });
      }

      // Verify student exists
      try {
        logger.info("Verifying student exists.");
        await fetchStudentById(student);
      } catch (err) {
        logger.warn("Student not found for grading.");
        return res
          .status(404)
          .json({ message: `Student not found: ${err.message}` });
      }

      // Verify course exists
      let courseData;
      try {
        logger.info("Verifying course exists.");
        courseData = await fetchCourseById(course);
      } catch (err) {
        logger.warn("Course not found for grading.");
        return res
          .status(404)
          .json({ message: `Course not found: ${err.message}` });
      }

      // If professor, ensure they created the course
      if (
        req.user.roles.includes(ROLES.PROFESSOR) &&
        courseData.createdBy !== req.user.id
      ) {
        logger.warn("Professor tried to grade a course they did not create.");
        return res.status(403).json({
          message: "Access forbidden: You can only grade students in courses you created",
        });
      }

      // Verify enrollment exists
      let enrollmentData;
      try {
        logger.info("Verifying student is enrolled in the course.");
        enrollmentData = await fetchEnrollmentByStudentAndCourse(student, course);
      } catch (err) {
        logger.warn("Student is not enrolled in this course.");
        return res
          .status(404)
          .json({ message: "Student is not enrolled in this course" });
      }

      // Check if grade already exists for this student+course
      const existingGrade = await Grade.findOne({ student, course });
      if (existingGrade) {
        logger.warn("A grade already exists for this student in this course.");
        return res
          .status(400)
          .json({ message: "A grade already exists for this student in this course. Use PUT to update." });
      }

      const newGrade = new Grade({
        student,
        course,
        enrollment: enrollmentData._id,
        grade,
        score,
        remarks,
        gradedBy: req.user.id,
      });

      const savedGrade = await newGrade.save();
      logger.info("Grade assigned successfully.");
      return res.status(201).json(savedGrade);
    } catch (error) {
      logger.error("Error assigning grade. " + error.message);
      return res.status(500).json({
        message: "Server Error: Unable to assign grade",
      });
    }
  }
);

// Get all grades (Admin and Professor only)
router.get(
  "/",
  verifyRole([ROLES.ADMIN, ROLES.PROFESSOR]),
  async (req, res) => {
    logger.info("Received request to fetch all grades.");
    try {
      const grades = await Grade.find();
      logger.info("Successfully fetched all grades.");
      return res.status(200).json(grades);
    } catch (error) {
      logger.error("Failed to fetch grades. " + error.message);
      return res.status(500).json({
        message: "Server Error: Unable to fetch grades",
      });
    }
  }
);

// Get a specific grade by ID (Admin and Professor only)
router.get(
  "/:id",
  verifyRole([ROLES.ADMIN, ROLES.PROFESSOR]),
  async (req, res) => {
    logger.info("Received request to fetch grade with ID: " + req.params.id);
    try {
      const grade = await Grade.findById(req.params.id);
      if (!grade) {
        logger.warn("No grade found with ID: " + req.params.id);
        return res.status(404).json({ message: "Grade not found" });
      }
      logger.info("Grade found and returned successfully.");
      return res.status(200).json(grade);
    } catch (error) {
      if (error.kind === "ObjectId") {
        return res.status(400).json({ message: "Invalid grade ID format" });
      }
      logger.error("Error fetching grade. " + error.message);
      return res.status(500).json({
        message: "Server Error: Unable to fetch grade",
      });
    }
  }
);

// Get all grades for a student (Admin, Professor, or Student themselves)
router.get(
  "/student/:studentId",
  verifyRole([ROLES.ADMIN, ROLES.PROFESSOR, ROLES.STUDENT]),
  restrictStudentToOwnData,
  async (req, res) => {
    const { studentId } = req.params;
    logger.info("Received request to fetch grades for student: " + studentId);
    try {
      const grades = await Grade.find({ student: studentId });
      if (!grades.length) {
        logger.warn("No grades found for student: " + studentId);
        return res
          .status(404)
          .json({ message: "No grades found for this student" });
      }
      logger.info("Grades fetched successfully for student: " + studentId);
      return res.status(200).json(grades);
    } catch (error) {
      logger.error("Error fetching grades for student. " + error.message);
      return res.status(500).json({
        message: "Server Error: Unable to fetch grades for student",
      });
    }
  }
);

// Get all grades for a course (Admin and Professor only)
router.get(
  "/course/:courseId",
  verifyRole([ROLES.ADMIN, ROLES.PROFESSOR]),
  async (req, res) => {
    const { courseId } = req.params;
    logger.info("Received request to fetch grades for course: " + courseId);
    try {
      const grades = await Grade.find({ course: courseId });
      if (!grades.length) {
        logger.warn("No grades found for course: " + courseId);
        return res
          .status(404)
          .json({ message: "No grades found for this course" });
      }
      logger.info("Grades fetched successfully for course: " + courseId);
      return res.status(200).json(grades);
    } catch (error) {
      logger.error("Error fetching grades for course. " + error.message);
      return res.status(500).json({
        message: "Server Error: Unable to fetch grades for course",
      });
    }
  }
);

// Update a grade (Admin or Professor who graded it)
router.put(
  "/:id",
  verifyRole([ROLES.ADMIN, ROLES.PROFESSOR]),
  async (req, res) => {
    const { id } = req.params;
    logger.info("Received request to update grade with ID: " + id);
    try {
      const gradeDoc = await Grade.findById(id);
      if (!gradeDoc) {
        logger.warn("No grade found for update with ID: " + id);
        return res.status(404).json({ message: "Grade not found" });
      }

      // If professor, ensure they are the one who graded it
      if (
        req.user.roles.includes(ROLES.PROFESSOR) &&
        gradeDoc.gradedBy !== req.user.id
      ) {
        logger.warn("Professor tried to update a grade they did not assign.");
        return res.status(403).json({
          message: "Access forbidden: You can only update grades you assigned",
        });
      }

      if (req.body.grade !== undefined) gradeDoc.grade = req.body.grade;
      if (req.body.score !== undefined) gradeDoc.score = req.body.score;
      if (req.body.remarks !== undefined) gradeDoc.remarks = req.body.remarks;
      gradeDoc.gradedAt = new Date();

      const updatedGrade = await gradeDoc.save();
      logger.info("Grade updated successfully.");
      return res
        .status(200)
        .json({ message: "Grade updated", grade: updatedGrade });
    } catch (error) {
      logger.error("Error updating grade. " + error.message);
      return res.status(500).json({
        message: "Server Error: Unable to update grade",
      });
    }
  }
);

// Delete a grade (Admin only)
router.delete(
  "/:id",
  verifyRole([ROLES.ADMIN]),
  async (req, res) => {
    const { id } = req.params;
    logger.info("Received request to delete grade with ID: " + id);
    try {
      const deletedGrade = await Grade.findByIdAndDelete(id);
      if (!deletedGrade) {
        logger.warn("No grade found for deletion with ID: " + id);
        return res.status(404).json({ message: "Grade not found" });
      }
      logger.info("Grade deleted successfully.");
      return res
        .status(200)
        .json({ message: "Grade deleted successfully", grade: deletedGrade });
    } catch (error) {
      if (error.kind === "ObjectId") {
        return res.status(400).json({ message: "Invalid grade ID format" });
      }
      logger.error("Error deleting grade. " + error.message);
      return res.status(500).json({
        message: "Server Error: Unable to delete grade",
      });
    }
  }
);

module.exports = router;
