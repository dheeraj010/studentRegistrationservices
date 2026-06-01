const express = require("express");
const Enrollment = require("../models/enrollment");
const router = express.Router();

const {
  verifyRole,
  restrictStudentToOwnData,
  fetchStudents,
  fetchStudentById,
  fetchCourses,
  fetchCourseById,
} = require("./auth/util");
const { ROLES } = require("../../consts");

// Create a new enrollment (Admin and Professor only)
router.post(
  "/",
  verifyRole([ROLES.ADMIN, ROLES.PROFESSOR]),
  async (req, res) => {
    try {
      const { student, course } = req.body;

      // Ensure both student and course IDs are provided
      if (!student || !course) {
        return res
          .status(400)
          .json({ message: "Student and Course are required" });
      }

      // Verify if student exists
      try {
        await fetchStudentById(student);
      } catch (err) {
        return res
          .status(404)
          .json({ message: `Student not found: ${err.message}` });
      }

      // Verify if course exists
      try {
        await fetchCourseById(course);
      } catch (err) {
        return res
          .status(404)
          .json({ message: `Course not found: ${err.message}` });
      }

      // Check if student is already enrolled in this course
      const existingEnrollment = await Enrollment.findOne({ student, course });
      if (existingEnrollment) {
        return res
          .status(400)
          .json({ message: "Student is already enrolled in this course" });
      }

      const newEnrollment = new Enrollment({ student, course });
      const savedEnrollment = await newEnrollment.save();
      return res.status(201).json(savedEnrollment);
    } catch (error) {
      console.error(error);
      return res.status(500).json({
        message: "Server Error: Unable to create enrollment",
      });
    }
  }
);

// Get all enrollments (Admin and Professor only)
router.get(
  "/",
  verifyRole([ROLES.ADMIN, ROLES.PROFESSOR]),
  async (req, res) => {
    try {
      let enrollments = await Enrollment.find();
      return res.status(200).json(enrollments);
    } catch (error) {
      return res.status(500).json({
        message: "Server Error: Unable to fetch enrollments",
      });
    }
  }
);

// Lookup specific enrollment by student and course (Admin and Grade Service only)
// Put before /:id so it doesn't match /:id route
router.get(
  "/lookup",
  verifyRole([ROLES.ADMIN, ROLES.GRADE_SERVICE]),
  async (req, res) => {
    try {
      const { student, course } = req.query;
      if (!student || !course) {
        return res
          .status(400)
          .json({ message: "Student and Course parameters are required" });
      }
      const enrollment = await Enrollment.findOne({ student, course });
      if (!enrollment) {
        return res.status(404).json({ message: "Enrollment not found" });
      }
      return res.status(200).json(enrollment);
    } catch (error) {
      return res.status(500).json({
        message: "Server Error: Unable to lookup enrollment",
      });
    }
  }
);

// Get a specific enrollment by ID (Admin and Professor only)
router.get(
  "/:id",
  verifyRole([ROLES.ADMIN, ROLES.PROFESSOR]),
  async (req, res) => {
    try {
      const enrollment = await Enrollment.findById(req.params.id);
      if (!enrollment) {
        return res.status(404).json({ message: "Enrollment not found" });
      }
      return res.status(200).json(enrollment);
    } catch (error) {
      if (error.kind === "ObjectId") {
        return res
          .status(400)
          .json({ message: "Invalid enrollment ID format" });
      }
      return res.status(500).json({
        message: "Server Error: Unable to fetch enrollment",
      });
    }
  }
);

// Get enrollment by student ID (Admin, Professor, Student, or Grade Service)
router.get(
  "/student/:id",
  verifyRole([ROLES.ADMIN, ROLES.PROFESSOR, ROLES.STUDENT, ROLES.GRADE_SERVICE]),
  restrictStudentToOwnData,
  async (req, res) => {
    try {
      let enrollments = await Enrollment.find({
        student: req.params.id,
      });

      if (!enrollments.length) {
        return res
          .status(404)
          .json({ message: "No enrollments found for this student" });
      }

      const courses = await fetchCourses();
      enrollments = enrollments.map((enrollment) => {
        const enrollmentObj = enrollment.toObject(); // Convert to plain object
        const course = courses.find(
          (course) => course._id.toString() === enrollmentObj.course.toString()
        );
        if (course) {
          enrollmentObj.course = course; // Replace course ID with the full course object
        }
        return enrollmentObj;
      });

      return res.status(200).json(enrollments);
    } catch (error) {
      return res.status(500).json({
        message: "Server Error: Unable to fetch enrollments for student",
      });
    }
  }
);

// Get enrollment by course ID (Admin, Professor, or Grade Service)
router.get(
  "/course/:id",
  verifyRole([ROLES.ADMIN, ROLES.PROFESSOR, ROLES.GRADE_SERVICE]),
  async (req, res) => {
    try {
      let enrollments = await Enrollment.find({
        course: req.params.id,
      });

      if (!enrollments.length) {
        return res
          .status(404)
          .json({ message: "No enrollments found for this course" });
      }

      const students = await fetchStudents();
      enrollments = enrollments.map((enrollment) => {
        const enrollmentObj = enrollment.toObject();
        const studentObj = students.find(
          (student) => student._id.toString() === enrollmentObj.student.toString()
        );
        if (studentObj) {
          enrollmentObj.student = studentObj; // Replace student ID with the full student object
        }
        return enrollmentObj;
      });

      return res.status(200).json(enrollments);
    } catch (error) {
      console.error(error);
      return res.status(500).json({
        message: "Server Error: Unable to fetch enrollments for course",
      });
    }
  }
);

// Delete an enrollment by ID (Admin and Professor only)
router.delete(
  "/:id",
  verifyRole([ROLES.ADMIN, ROLES.PROFESSOR]),
  async (req, res) => {
    try {
      const enrollment = await Enrollment.findByIdAndDelete(req.params.id);

      if (!enrollment) {
        return res.status(404).json({ message: "Enrollment not found" });
      }

      return res
        .status(200)
        .json({ message: "Enrollment deleted successfully", enrollment });
    } catch (error) {
      if (error.kind === "ObjectId") {
        return res
          .status(400)
          .json({ message: "Invalid enrollment ID format" });
      }
      return res.status(500).json({
        message: "Server Error: Unable to delete enrollment",
      });
    }
  }
);

module.exports = router;
